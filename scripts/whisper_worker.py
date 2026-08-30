import gc
import json
import os
import sys
import traceback
import wave

import ctranslate2
import numpy as np
from faster_whisper import WhisperModel


SAMPLE_RATE = 16000

model = None
model_name = None
model_dir = None
model_device = None
model_compute_type = None


def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + '\n')
    sys.stdout.flush()


def cuda_available():
    try:
        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


def gpu_name():
    if not cuda_available():
        return None
    try:
        return ctranslate2.get_cuda_device_name(0)
    except Exception:
        return 'cuda'


def resolve_device(requested):
    requested = (requested or 'auto').lower()
    if requested == 'auto':
        return 'cuda' if cuda_available() else 'cpu'
    if requested == 'cuda' and not cuda_available():
        raise RuntimeError(
            'CUDA was requested but CTranslate2 has no CUDA device'
        )
    return requested


def resolve_compute_type(device, requested):
    requested = (requested or 'auto').lower()
    if requested and requested != 'auto':
        return requested
    return 'float16' if device == 'cuda' else 'int8'


def unload_model():
    global model, model_name, model_dir, model_device, model_compute_type
    model = None
    model_name = None
    model_dir = None
    model_device = None
    model_compute_type = None
    gc.collect()


def ensure_model(request):
    global model, model_name, model_dir, model_device, model_compute_type
    requested_name = request.get('model') or 'small'
    requested_dir = request.get('model_dir') or None
    requested_device = resolve_device(request.get('device') or 'auto')
    requested_compute = resolve_compute_type(
        requested_device, request.get('compute_type') or 'auto'
    )

    if (
        model is None
        or model_name != requested_name
        or model_dir != requested_dir
        or model_device != requested_device
        or model_compute_type != requested_compute
    ):
        unload_model()
        kwargs = {
            'device': requested_device,
            'compute_type': requested_compute,
        }
        if requested_dir:
            kwargs['download_root'] = requested_dir
        model = WhisperModel(requested_name, **kwargs)
        model_name = requested_name
        model_dir = requested_dir
        model_device = requested_device
        model_compute_type = requested_compute

    return model, requested_device, requested_compute


def load_audio_input(audio_path):
    """Read the app's PCM WAV directly so ffmpeg is not required for recording."""
    if not str(audio_path).lower().endswith('.wav'):
        return audio_path

    try:
        with wave.open(audio_path, 'rb') as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frames = wav_file.readframes(wav_file.getnframes())

        if sample_width != 2:
            return audio_path

        samples = np.frombuffer(frames, dtype='<i2').astype(np.float32)
        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)
        samples /= 32768.0

        if sample_rate != SAMPLE_RATE and samples.size:
            output_size = max(1, round(samples.size * SAMPLE_RATE / sample_rate))
            source_positions = np.arange(samples.size, dtype=np.float64)
            target_positions = np.linspace(0, samples.size - 1, output_size)
            samples = np.interp(target_positions, source_positions, samples).astype(np.float32)

        return samples
    except (OSError, EOFError, wave.Error, ValueError):
        return audio_path


def transcribe(request):
    loaded_model, device, compute_type = ensure_model(request)
    language = request.get('language') or None
    if language in ('auto', 'detect'):
        language = None

    segments, info = loaded_model.transcribe(
        load_audio_input(request['audio_path']),
        language=language,
        task='transcribe',
        beam_size=5,
        temperature=0,
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    text = ''.join(segment.text for segment in segments).strip()
    return {
        'text': text,
        'language': getattr(info, 'language', None),
        'device': device,
        'compute_type': compute_type,
        'model': model_name,
        'cuda_available': cuda_available(),
        'gpu': gpu_name(),
    }


send({
    'event': 'ready',
    'pid': os.getpid(),
    'engine': 'faster-whisper',
    'ctranslate2': getattr(ctranslate2, '__version__', None),
    'cuda_available': cuda_available(),
    'gpu': gpu_name(),
})

for raw_line in sys.stdin:
    raw_line = raw_line.strip()
    if not raw_line:
        continue

    request_id = None
    try:
        request = json.loads(raw_line)
        request_id = request.get('id')
        action = request.get('action')

        if action == 'transcribe':
            send({'id': request_id, 'ok': True, **transcribe(request)})
        elif action == 'warmup':
            _, device, compute_type = ensure_model(request)
            send({
                'id': request_id,
                'ok': True,
                'warmed': True,
                'device': device,
                'compute_type': compute_type,
                'model': model_name,
                'cuda_available': cuda_available(),
                'gpu': gpu_name(),
            })
        elif action == 'unload':
            unload_model()
            send({'id': request_id, 'ok': True, 'unloaded': True})
        elif action == 'shutdown':
            unload_model()
            send({'id': request_id, 'ok': True, 'shutdown': True})
            break
        else:
            raise ValueError(f'Unsupported worker action: {action}')
    except Exception as error:
        send({
            'id': request_id,
            'ok': False,
            'error': str(error),
            'traceback': traceback.format_exc(),
        })
