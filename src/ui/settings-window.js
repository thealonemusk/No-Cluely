document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.getElementById('closeButton');
    const quitButton = document.getElementById('quitButton');
    const fields = {
        windowGap: document.getElementById('windowGap'),
        llmProvider: document.getElementById('llmProvider'),
        geminiKey: document.getElementById('geminiKey'),
        claudeKey: document.getElementById('claudeKey'),
        cursorKey: document.getElementById('cursorKey'),
        speechProvider: document.getElementById('speechProvider'),
        whisperCaptureMode: document.getElementById('whisperCaptureMode'),
        whisperResponseTarget: document.getElementById('whisperResponseTarget')
    };

    if (!window.api) {
        console.error('window.api not available');
        return;
    }

    const applySettings = (settings) => {
        if (!settings) return;
        if (fields.windowGap) fields.windowGap.value = settings.windowGap ?? '';
        if (fields.llmProvider) fields.llmProvider.value = settings.llmProvider || 'gemini';
        if (fields.geminiKey) fields.geminiKey.value = settings.geminiKey || '';
        if (fields.claudeKey) fields.claudeKey.value = settings.claudeKey || '';
        if (fields.cursorKey) fields.cursorKey.value = settings.cursorKey || '';
        if (fields.speechProvider) fields.speechProvider.value = settings.speechProvider || 'whisper';
        if (fields.whisperCaptureMode) fields.whisperCaptureMode.value = settings.whisperCaptureMode || 'manual';
        if (fields.whisperResponseTarget) fields.whisperResponseTarget.value = settings.whisperResponseTarget || 'chat';
        updateProviderFields();
    };

    const updateProviderFields = () => {
        const provider = fields.llmProvider ? fields.llmProvider.value : 'gemini';
        document.querySelectorAll('[data-provider-field]').forEach((row) => {
            row.style.display = row.getAttribute('data-provider-field') === provider ? '' : 'none';
        });
    };

    const collectSettings = () => ({
        windowGap: fields.windowGap ? fields.windowGap.value : undefined,
        llmProvider: fields.llmProvider ? fields.llmProvider.value : undefined,
        geminiKey: fields.geminiKey ? fields.geminiKey.value : undefined,
        claudeKey: fields.claudeKey ? fields.claudeKey.value : undefined,
        cursorKey: fields.cursorKey ? fields.cursorKey.value : undefined,
        speechProvider: fields.speechProvider ? fields.speechProvider.value : undefined,
        whisperCaptureMode: fields.whisperCaptureMode ? fields.whisperCaptureMode.value : undefined,
        whisperResponseTarget: fields.whisperResponseTarget ? fields.whisperResponseTarget.value : undefined
    });

    const saveSettings = () => {
        const settings = collectSettings();
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings(settings);
        } else {
            window.api.send('save-settings', settings);
        }
    };

    const requestCurrentSettings = () => {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings().then(applySettings).catch((error) => {
                console.error('Failed to get settings:', error);
            });
        }
    };

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.api.send('close-settings');
        });
    }

    if (quitButton) {
        quitButton.addEventListener('click', () => {
            try {
                if (window.api && window.api.send) {
                    window.api.send('quit-app');
                }
                if (window.electronAPI && window.electronAPI.quit) {
                    window.electronAPI.quit();
                }
                setTimeout(() => window.close(), 500);
            } catch (error) {
                console.error('Error quitting app:', error);
                window.close();
            }
        });
    }

    window.api.receive('load-settings', applySettings);

    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('settings-window-shown', () => {
            requestCurrentSettings();
        });
    }

    Object.values(fields).forEach((el) => {
        if (!el) return;
        el.addEventListener('change', saveSettings);
        if (el.tagName === 'INPUT') {
            el.addEventListener('blur', saveSettings);
        }
    });

    if (fields.llmProvider) {
        fields.llmProvider.addEventListener('change', updateProviderFields);
    }

    setTimeout(requestCurrentSettings, 200);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.api.send('close-settings');
        }
    });
});
