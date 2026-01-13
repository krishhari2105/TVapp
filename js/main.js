document.addEventListener('DOMContentLoaded', function() {
    var video = document.getElementById('videoPlayer');
    var videoContainer = document.getElementById('videoContainer');
    var channelList = document.getElementById('channelList');
    var listContainer = document.getElementById('listContainer');

    var player, ui;
    var channels = []; 
    var currentChannelIndex = 0;
    var focusedChannelIndex = 0;
    var isListVisible = false;

    // 1. ADD YOUR MULTIPLE M3U LINKS HERE
    const M3U_URLS = [
        'https://iptv-org.github.io/iptv/languages/tam.m3u',
        'https://raw.githubusercontent.com/Jitendra-unatti/fancode/refs/heads/main/data/fancode.m3u',
        //'https://raw.githubusercontent.com/doctor-8trange/quarnex/refs/heads/main/data/zee5.m3u',
        //'https://raw.githubusercontent.com/doctor-8trange/zyphora/refs/heads/main/data/sony.m3u'
    ];

    async function fetchAndParseAllM3Us() {
        channels = []; // Clear existing list
        console.log('Fetching all dynamic M3U lists...');

        for (const url of M3U_URLS) {
            try {
                const response = await fetch(url);
                const data = await response.text();
                parseM3UContent(data);
            } catch (error) {
                console.error('Failed to fetch M3U from:', url, error);
            }
        }

        console.log('Total Channels Loaded:', channels.length);
        rebuildUIList();
        
        // --- AUTO-PLAY SUN TV ON STARTUP ---
        if (channels.length > 0) {
            // Find Sun TV (case-insensitive search)
            const sunTvIndex = channels.findIndex(ch => 
                ch.name && ch.name.toLowerCase().includes('sun tv')
            );

            if (sunTvIndex !== -1) {
                console.log('Found Sun TV at index:', sunTvIndex);
                loadChannel(sunTvIndex);
            } else {
                console.log('Sun TV not found, loading first channel instead.');
                loadChannel(0);
            }
        }
    }

    function parseM3UContent(data) {
        const lines = data.split('\n');
        let currentChannel = {};

        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('#EXTINF')) {
                // Extract name
                const nameMatch = line.match(/,(.+)$/);
                currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
                
                // Extract logo
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                currentChannel.logo = logoMatch ? logoMatch[1] : null;
            } else if (line.startsWith('http')) {
                // Strip headers and take URL
                currentChannel.url = line.split('|')[0];
                channels.push(currentChannel);
                currentChannel = {};
            }
        });
    }

    function rebuildUIList() {
        listContainer.innerHTML = ''; 
        channels.forEach(function(channel, index) {
            var li = document.createElement('li');
            li.textContent = channel.name;
            li.classList.add('channel-item');
            li.id = 'channel-' + index;
            listContainer.appendChild(li);
        });
    }

    async function initPlayer() {
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
            player = new shaka.Player();
            await player.attach(video);
            
            // 2. UPDATED SHAKA CONFIG (v4.7 Compatible)
            player.configure({
                streaming: {
                    // This is the correct key for v4.7 to handle stream gaps
                    gapDetectionThreshold: 0.5,
                    // Optional: Checks for gaps every 250ms
                    gapJumpTimerTime: 0.25
                }
            });

            // Removed forceTransmux as requested

            ui = new shaka.ui.Overlay(player, videoContainer, video);
            ui.configure({ 
                'controlPanelElements': ['play_pause', 'time_and_duration', 'spacer', 'language', 'fullscreen', 'overflow_menu'] 
            });

            player.addEventListener('error', (event) => console.error('Shaka Error:', event.detail));

            await fetchAndParseAllM3Us();
        }
    }

    // 3. AUTO-SWITCH FEATURE
    async function loadChannel(index, retryCount = 0) {
        // Prevent infinite loops if ALL channels are down
        if (retryCount >= channels.length) {
            console.error('All channels failed to load.');
            alert('Unable to load any channels. Please check your playlists.');
            return;
        }

        if (!channels[index]) return;
        
        console.log('Loading:', channels[index].name);
        try {
            await player.load(channels[index].url);
            
            // Successful load
            currentChannelIndex = index;
            isListVisible = false;
            channelList.classList.add('hidden');
            showChannelBanner(channels[index].name);
        } catch (e) {
            console.warn(`Channel ${channels[index].name} failed. Error:`, e.code);
            
            // AUTO-SWITCH: If load fails, try the next channel automatically
            const nextIndex = (index + 1) % channels.length;
            console.log(`Auto-switching to: ${channels[nextIndex].name}`);
            loadChannel(nextIndex, retryCount + 1);
        }
    }

    function toggleChannelList() {
        isListVisible = !isListVisible;
        if (isListVisible) {
            focusedChannelIndex = currentChannelIndex;
            updateListFocus();
            channelList.classList.remove('hidden');
        } else {
            channelList.classList.add('hidden');
        }
    }

    function updateListFocus() {
        var items = document.querySelectorAll('.channel-item');
        items.forEach(function(item, index) {
            if (index === focusedChannelIndex) {
                item.classList.add('focused');
                item.scrollIntoView({ block: 'center' });
            } else {
                item.classList.remove('focused');
            }
        });
    }

    function showChannelBanner(channelName) {
        var banner = document.getElementById('channelBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'channelBanner';
            banner.style.position = 'absolute';
            banner.style.bottom = '0';
            banner.style.left = '0';
            banner.style.width = '100%';
            banner.style.height = '15%';
            banner.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            banner.style.color = 'white';
            banner.style.fontSize = '32px';
            banner.style.display = 'flex';
            banner.style.alignItems = 'center';
            banner.style.paddingLeft = '60px';
            banner.style.zIndex = '1500';
            document.body.appendChild(banner);
        }
        banner.innerHTML = `<span>${channelName}</span>`;
        banner.style.display = 'flex';
        setTimeout(function() { banner.style.display = 'none'; }, 5000);
    }

    document.addEventListener('keydown', function(event) {
        var keyCode = event.keyCode;
        switch (event.key) {
            case 'Enter':
            case 'Select':
                if (!isListVisible) toggleChannelList();
                else loadChannel(focusedChannelIndex);
                break;
            case 'ArrowUp':
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex - 1 + channels.length) % channels.length;
                    updateListFocus();
                } else loadChannel((currentChannelIndex + 1) % channels.length);
                break;
            case 'ArrowDown':
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex + 1) % channels.length;
                    updateListFocus();
                } else loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
                break;
            case 'Back':
            case 'XF86Back':
            case '10009':
                if (isListVisible) toggleChannelList();
                else if (confirm('Exit TVapp?')) tizen.application.getCurrentApplication().exit();
                break;
        }
        // Channel Up/Down Remote Keys
        if (keyCode === 427) loadChannel((currentChannelIndex + 1) % channels.length);
        if (keyCode === 428) loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
    });

    initPlayer();
});