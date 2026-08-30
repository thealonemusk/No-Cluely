document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.getElementById('closeButton');
    const quitButton = document.getElementById('quitButton');
    const windowGapInput = document.getElementById('windowGap');

    if (!window.api) {
        console.error('window.api not available');
        return;
    }

    const requestCurrentSettings = () => {
        if (window.electronAPI && window.electronAPI.getSettings) {
            window.electronAPI.getSettings().then((settings) => {
                if (windowGapInput) windowGapInput.value = settings.windowGap || '';
            }).catch((error) => {
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
                setTimeout(() => {
                    window.close();
                }, 500);
            } catch (error) {
                console.error('Error quitting app:', error);
                window.close();
            }
        });
    }

    window.api.receive('load-settings', (settings) => {
        if (windowGapInput) windowGapInput.value = settings.windowGap || '';
    });

    if (window.electronAPI && window.electronAPI.receive) {
        window.electronAPI.receive('settings-window-shown', () => {
            requestCurrentSettings();
        });
    }

    if (windowGapInput) {
        const saveWindowGap = () => {
            window.api.send('save-settings', { windowGap: windowGapInput.value });
        };
        windowGapInput.addEventListener('change', saveWindowGap);
        windowGapInput.addEventListener('blur', saveWindowGap);
    }

    setTimeout(requestCurrentSettings, 200);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.api.send('close-settings');
        }
    });
});
