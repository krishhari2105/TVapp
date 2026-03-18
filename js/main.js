document.addEventListener('DOMContentLoaded', function() {
    var video = document.getElementById('videoPlayer');
    var videoContainer = document.getElementById('videoContainer');
    var channelList = document.getElementById('channelList');
    var listContainer = document.getElementById('listContainer');
    var homeScreen = document.getElementById('homeScreen');
    var playlistList = document.getElementById('playlistList');
    var playlistUrlInput = document.getElementById('playlistUrlInput');
    var homeTitle = document.getElementById('homeTitle');
    var homeHint = document.getElementById('homeHint');
    var playerOptions = document.getElementById('playerOptions');
    var playerOptionsList = document.getElementById('playerOptionsList');
    var playerOptionsHint = document.getElementById('playerOptionsHint');
    var playerOptionsDropdown = document.getElementById('playerOptionsDropdown');
    var playerOptionsDropdownTitle = document.getElementById('playerOptionsDropdownTitle');
    var playerOptionsDropdownList = document.getElementById('playerOptionsDropdownList');
    var channelSearch = document.getElementById('channelSearch');
    var channelSearchInput = document.getElementById('channelSearchInput');
    var channelSearchResults = document.getElementById('channelSearchResults');

    var player;
    var ui;
    var hlsPlayer = null;
    var channels = [];
    var playlists = [];
    var favorites = [];
    var currentChannelIndex = 0;
    var focusedChannelIndex = 0;
    var focusedPlaylistIndex = 0;
    var isListVisible = false;
    var currentScreen = 'home';
    var currentPlaylist = null;
    var homeFocusIndex = 0;
    var currentPlaybackEngine = null;
    var isPlayerOptionsVisible = false;
    var playerOptionItems = [];
    var focusedPlayerOptionIndex = 0;
    var isPlayerOptionsDropdownVisible = false;
    var focusedPlayerDropdownIndex = 0;
    var homePlaylistActionMode = 'open';
    var activeLoadRequestId = 0;
    var isChannelLoading = false;
    var bannerHideTimer = null;
    var isSearchVisible = false;
    var searchResults = [];
    var focusedSearchIndex = 0;
    var searchFocusArea = 'input';

    var PLAYLIST_STORAGE_KEY = 'tvapp.playlists';
    var FAVORITES_STORAGE_KEY = 'tvapp.favorites';
    var HOME_ACTION_COUNT = 2;
    var DEFAULT_PLAYLISTS = [
        {
            id: createId(),
            name: 'playlist.php',
            url: 'http://192.168.1.3:8080/JioTv/playlist.php'
        }
    ];

    function createId() {
        return 'playlist-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function createChannelId(playlistId, channel) {
        return [playlistId || 'favorites', channel.name || 'unknown', channel.url || ''].join('::');
    }

    function derivePlaylistName(url) {
        try {
            var parsedUrl = new URL(url);
            var lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() || parsedUrl.hostname;
            return lastSegment.replace(/\.m3u8?$/i, '') || parsedUrl.hostname;
        } catch (error) {
            return 'Playlist ' + (playlists.length + 1);
        }
    }

    function normalizeFavorite(item) {
        if (!item || !item.url) {
            return null;
        }

        return {
            id: item.id || createChannelId(item.playlistId || 'favorites', item),
            name: item.name || 'Unknown Channel',
            url: item.url,
            logo: item.logo || null,
            playlistId: item.playlistId || null,
            playlistName: item.playlistName || 'Unknown Playlist'
        };
    }

    function loadSavedPlaylists() {
        try {
            var savedPlaylists = localStorage.getItem(PLAYLIST_STORAGE_KEY);
            if (!savedPlaylists) {
                playlists = DEFAULT_PLAYLISTS.slice();
                savePlaylists();
                return;
            }

            var parsed = JSON.parse(savedPlaylists);
            if (!Array.isArray(parsed)) {
                playlists = DEFAULT_PLAYLISTS.slice();
                savePlaylists();
                return;
            }

            playlists = parsed.filter(function(item) {
                return item && typeof item.url === 'string' && item.url.trim();
            }).map(function(item, index) {
                return {
                    id: item.id || ('playlist-imported-' + index),
                    name: item.name || derivePlaylistName(item.url),
                    url: item.url.trim()
                };
            });

            if (!playlists.length) {
                playlists = DEFAULT_PLAYLISTS.slice();
                savePlaylists();
            }
        } catch (error) {
            console.error('Failed to load saved playlists:', error);
            playlists = DEFAULT_PLAYLISTS.slice();
            savePlaylists();
        }
    }

    function loadSavedFavorites() {
        try {
            var savedFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (!savedFavorites) {
                favorites = [];
                return;
            }

            var parsed = JSON.parse(savedFavorites);
            favorites = Array.isArray(parsed)
                ? parsed.map(normalizeFavorite).filter(Boolean)
                : [];
        } catch (error) {
            console.error('Failed to load favorites:', error);
            favorites = [];
        }
    }

    function savePlaylists() {
        localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(playlists));
    }

    function saveFavorites() {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    }

    function isFavoritesView() {
        return currentPlaylist && currentPlaylist.id === 'favorites';
    }

    function getHomeEntries() {
        var entries = [{
            id: 'favorites-home',
            name: 'Favorites',
            subtitle: favorites.length ? (favorites.length + ' saved channels') : 'No favorites saved yet',
            kind: 'favorites'
        }];

        playlists.forEach(function(playlist) {
            entries.push({
                id: playlist.id,
                name: playlist.name,
                subtitle: playlist.url,
                kind: 'playlist'
            });
        });

        return entries;
    }

    function setScreen(screen) {
        currentScreen = screen;
        var isHome = screen === 'home';

        homeScreen.classList.toggle('hidden', !isHome);
        videoContainer.classList.toggle('hidden', isHome);
        channelList.classList.add('hidden');
        isListVisible = false;

        if (isHome) {
            homeTitle.textContent = 'Playlists';
            homeHint.textContent = 'Enter opens. Right highlights Delete on a playlist. Red favorites in player.';
            renderHome();
        }
    }

    function renderHome() {
        var entries = getHomeEntries();

        playlistList.innerHTML = '';

        entries.forEach(function(entry, index) {
            var li = document.createElement('li');
            li.className = 'home-item playlist-item';
            li.dataset.role = entry.kind;
            li.dataset.focusIndex = String(index);
            li.dataset.entryIndex = String(index);

            var meta = document.createElement('div');
            meta.className = 'playlist-meta';

            var title = document.createElement('div');
            title.className = 'home-item-title';
            title.textContent = entry.name;
            meta.appendChild(title);

            var subtitle = document.createElement('div');
            subtitle.className = 'home-item-subtitle';
            subtitle.textContent = entry.subtitle;
            meta.appendChild(subtitle);

            li.appendChild(meta);

            if (entry.kind === 'playlist') {
                var actions = document.createElement('div');
                actions.className = 'playlist-actions';

                var removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'delete-playlist';
                removeButton.textContent = 'Delete';
                removeButton.dataset.index = String(index - 1);
                actions.appendChild(removeButton);

                li.appendChild(actions);
            }

            playlistList.appendChild(li);
        });

        var addRow = document.createElement('li');
        addRow.className = 'home-item home-action';
        addRow.dataset.role = 'add';
        addRow.dataset.focusIndex = String(entries.length);
        addRow.innerHTML = '<span class="home-item-title">Add Playlist URL</span><span class="home-item-subtitle">Paste or type an M3U link below, then press Enter.</span>';
        playlistList.appendChild(addRow);

        var inputRow = document.createElement('li');
        inputRow.className = 'home-item home-input-row';
        inputRow.dataset.role = 'input';
        inputRow.dataset.focusIndex = String(entries.length + 1);
        inputRow.appendChild(playlistUrlInput);
        playlistList.appendChild(inputRow);

        var maxFocusIndex = entries.length + HOME_ACTION_COUNT - 1;
        if (homeFocusIndex > maxFocusIndex) {
            homeFocusIndex = maxFocusIndex;
        }

        syncHomeFocus();
    }

    function syncHomeFocus() {
        var items = playlistList.querySelectorAll('.home-item');
        items.forEach(function(item) {
            item.classList.remove('focused');
            var button = item.querySelector('.delete-playlist');
            if (button) {
                button.classList.remove('button-focused');
            }
        });

        if (!items.length) {
            return;
        }

        var activeItem = playlistList.querySelector('.home-item[data-focus-index="' + homeFocusIndex + '"]');
        if (!activeItem) {
            activeItem = items[0];
            homeFocusIndex = Number(activeItem.dataset.focusIndex || 0);
        }

        if (activeItem.dataset.role === 'input') {
            playlistUrlInput.focus();
        } else {
            playlistUrlInput.blur();
        }

        if (activeItem) {
            activeItem.classList.add('focused');
            var deleteButton = activeItem.querySelector('.delete-playlist');
            if (deleteButton) {
                deleteButton.classList.toggle('button-focused', activeItem.dataset.role === 'playlist' && homePlaylistActionMode === 'delete');
            }
            activeItem.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
    }

    function moveHomeFocus(direction) {
        var totalItems = playlistList.querySelectorAll('.home-item').length;
        if (!totalItems) {
            return;
        }

        homeFocusIndex = (homeFocusIndex + direction + totalItems) % totalItems;
        syncHomeFocus();
    }

    function addPlaylist() {
        var url = playlistUrlInput.value.trim();
        if (!url) {
            alert('Enter a playlist URL first.');
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            alert('Enter a valid http or https M3U URL.');
            return;
        }

        var existingPlaylist = playlists.find(function(item) {
            return item.url === url;
        });

        if (existingPlaylist) {
            alert('That playlist URL is already saved.');
            return;
        }

        playlists.push({
            id: createId(),
            name: derivePlaylistName(url),
            url: url
        });
        savePlaylists();
        playlistUrlInput.value = '';
        homeFocusIndex = playlists.length;
        focusedPlaylistIndex = playlists.length - 1;
        renderHome();
    }

    function deletePlaylist(index) {
        if (!playlists[index]) {
            return;
        }

        var shouldDelete = confirm('Delete "' + playlists[index].name + '"?');
        if (!shouldDelete) {
            return;
        }

        var deletedPlaylist = playlists[index];
        playlists.splice(index, 1);
        savePlaylists();

        favorites = favorites.filter(function(item) {
            return item.playlistId !== deletedPlaylist.id;
        });
        saveFavorites();

        if (focusedPlaylistIndex >= playlists.length) {
            focusedPlaylistIndex = Math.max(0, playlists.length - 1);
        }
        renderHome();
    }

    function normalizeParsedChannel(channel, playlist) {
        return {
            id: createChannelId(playlist.id, channel),
            name: channel.name || 'Unknown Channel',
            logo: channel.logo || null,
            url: channel.url,
            playlistId: playlist.id,
            playlistName: playlist.name
        };
    }

    async function openPlaylist(index) {
        var playlist = playlists[index];
        if (!playlist) {
            return;
        }

        currentPlaylist = playlist;
        homeTitle.textContent = 'Loading Playlist';
        homeHint.textContent = 'Fetching channels from ' + playlist.name + '...';

        try {
            var loadedChannels = await fetchAndParseM3U(playlist.url);
            if (!loadedChannels.length) {
                throw new Error('No channels found in playlist.');
            }

            channels = loadedChannels.map(function(channel) {
                return normalizeParsedChannel(channel, playlist);
            });
            currentChannelIndex = 0;
            focusedChannelIndex = 0;
            rebuildUIList();
            setScreen('player');
            await loadChannel(0);
        } catch (error) {
            console.error('Failed to open playlist:', error);
            currentPlaylist = null;
            setScreen('home');
            alert('Failed to load playlist. Please check the URL and try again.');
        }
    }

    function openFavorites() {
        currentPlaylist = {
            id: 'favorites',
            name: 'Favorites'
        };
        channels = favorites.slice();
        currentChannelIndex = 0;
        focusedChannelIndex = 0;
        rebuildUIList();
        setScreen('player');

        if (!channels.length) {
            alert('No favorites saved yet.');
            returnToHome();
            return;
        }

        loadChannel(0);
    }

    async function fetchAndParseM3U(url) {
        var response = await fetch(url);
        if (!response.ok) {
            throw new Error('Playlist request failed with status ' + response.status);
        }

        var data = await response.text();
        return parseM3UContent(data);
    }

    function parseM3UContent(data) {
        var parsedChannels = [];
        var lines = data.split('\n');
        var currentChannel = {};

        lines.forEach(function(rawLine) {
            var line = rawLine.trim();
            if (line.startsWith('#EXTINF')) {
                var nameMatch = line.match(/,(.+)$/);
                currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';

                var logoMatch = line.match(/tvg-logo="([^"]+)"/);
                currentChannel.logo = logoMatch ? logoMatch[1] : null;
            } else if (line.startsWith('http')) {
                currentChannel.url = line.split('|')[0];
                parsedChannels.push({
                    name: currentChannel.name || 'Unknown Channel',
                    logo: currentChannel.logo || null,
                    url: currentChannel.url
                });
                currentChannel = {};
            }
        });

        return parsedChannels;
    }

    function isFavoriteChannel(channel) {
        return favorites.some(function(item) {
            return item.id === channel.id || item.url === channel.url;
        });
    }

    function toggleFavoriteByIndex(index) {
        var channel = channels[index];
        if (!channel) {
            return;
        }

        var favoriteIndex = favorites.findIndex(function(item) {
            return item.id === channel.id || item.url === channel.url;
        });

        if (favoriteIndex !== -1) {
            favorites.splice(favoriteIndex, 1);
            saveFavorites();

            if (isFavoritesView()) {
                channels.splice(index, 1);
                if (!channels.length) {
                    rebuildUIList();
                    alert('Favorites list is now empty.');
                    returnToHome();
                    return;
                }
                focusedChannelIndex = Math.min(focusedChannelIndex, channels.length - 1);
                currentChannelIndex = Math.min(currentChannelIndex, channels.length - 1);
                rebuildUIList();
                updateListFocus();
            }

            showChannelBanner('Removed from Favorites');
            return;
        }

        favorites.push({
            id: channel.id,
            name: channel.name,
            url: channel.url,
            logo: channel.logo || null,
            playlistId: channel.playlistId || null,
            playlistName: channel.playlistName || (currentPlaylist ? currentPlaylist.name : 'Unknown Playlist')
        });
        saveFavorites();
        showChannelBanner('Added to Favorites');
    }

    function rebuildUIList() {
        listContainer.innerHTML = '';
        channels.forEach(function(channel, index) {
            var li = document.createElement('li');
            var favoriteMark = isFavoriteChannel(channel) ? '★ ' : '';
            var subtitle = isFavoritesView() && channel.playlistName ? '<div class="channel-item-subtitle">' + channel.playlistName + '</div>' : '';
            li.innerHTML = '<div>' + favoriteMark + channel.name + '</div>' + subtitle;
            li.classList.add('channel-item');
            li.id = 'channel-' + index;
            listContainer.appendChild(li);
        });
    }

    function getManifestMimeType(url) {
        var normalizedUrl = String(url || '').toLowerCase();
        if (normalizedUrl.includes('.mpd')) {
            return 'application/dash+xml';
        }
        if (
            normalizedUrl.includes('.m3u8') ||
            normalizedUrl.includes('.m3u') ||
            normalizedUrl.includes('live.php') ||
            normalizedUrl.includes('playlist.php')
        ) {
            return 'application/x-mpegurl';
        }
        return undefined;
    }

    function getStreamType(url) {
        var normalizedUrl = String(url || '').toLowerCase();
        if (
            normalizedUrl.includes('.m3u8') ||
            normalizedUrl.includes('.m3u') ||
            normalizedUrl.includes('live.php') ||
            normalizedUrl.includes('playlist.php') ||
            normalizedUrl.includes('wanda.php')
        ) {
            return 'hls';
        }
        if (normalizedUrl.includes('.mpd')) {
            return 'dash';
        }
        if (normalizedUrl.includes('.ts')) {
            return 'mpegts';
        }
        return 'unknown';
    }

    function destroyHlsPlayer() {
        if (hlsPlayer) {
            hlsPlayer.destroy();
            hlsPlayer = null;
        }
        currentPlaybackEngine = null;
    }

    function isStaleLoad(requestId) {
        return requestId !== activeLoadRequestId;
    }

    function formatQualityLabel(level) {
        if (!level) {
            return 'Unknown';
        }

        if (level.height) {
            return level.height + 'p';
        }

        if (level.bitrate) {
            return Math.round(level.bitrate / 1000) + ' kbps';
        }

        return 'Level';
    }

    function getCurrentQualityText() {
        if (!hlsPlayer) {
            return 'Unavailable';
        }

        if (hlsPlayer.currentLevel === -1 || hlsPlayer.loadLevel === -1 || hlsPlayer.autoLevelEnabled) {
            return 'Auto';
        }

        return formatQualityLabel(hlsPlayer.levels[hlsPlayer.currentLevel]);
    }

    function getCurrentAudioText() {
        if (!hlsPlayer || !hlsPlayer.audioTracks || !hlsPlayer.audioTracks.length) {
            return 'Unavailable';
        }

        var track = hlsPlayer.audioTracks[hlsPlayer.audioTrack];
        if (!track) {
            return 'Default';
        }

        return track.name || track.lang || ('Track ' + (hlsPlayer.audioTrack + 1));
    }

    function buildPlayerOptionItems() {
        if (currentPlaybackEngine !== 'hls.js' || !hlsPlayer) {
            return [];
        }

        var items = [];

        items.push({
            type: 'quality',
            title: 'Quality',
            value: getCurrentQualityText(),
            options: [{ label: 'Auto', value: -1 }].concat(hlsPlayer.levels.map(function(level, index) {
                return {
                    label: formatQualityLabel(level),
                    value: index
                };
            }))
        });

        if (hlsPlayer.audioTracks && hlsPlayer.audioTracks.length) {
            items.push({
                type: 'audio',
                title: 'Audio',
                value: getCurrentAudioText(),
                options: hlsPlayer.audioTracks.map(function(track, index) {
                    return {
                        label: track.name || track.lang || ('Track ' + (index + 1)),
                        value: index
                    };
                })
            });
        }

        return items;
    }

    function renderPlayerOptions() {
        playerOptionItems = buildPlayerOptionItems();
        playerOptionsList.innerHTML = '';

        if (!playerOptionItems.length) {
            playerOptionsHint.textContent = 'No HLS.js quality or audio controls are available for the current playback.';
        } else {
            playerOptionsHint.textContent = 'Select a row and press OK to open options. Back closes.';
        }

        playerOptionItems.forEach(function(item, index) {
            var li = document.createElement('li');
            li.className = 'player-option-item';
            li.dataset.index = String(index);
            li.innerHTML = '<span class="player-option-title">' + item.title + '</span><span class="player-option-value">' + item.value + ' ▾</span>';
            playerOptionsList.appendChild(li);
        });

        updatePlayerOptionsFocus();
    }

    function updatePlayerOptionsFocus() {
        var items = playerOptionsList.querySelectorAll('.player-option-item');
        items.forEach(function(item, index) {
            item.classList.toggle('focused', index === focusedPlayerOptionIndex);
        });
    }

    function renderPlayerOptionsDropdown() {
        var item = playerOptionItems[focusedPlayerOptionIndex];
        if (!item) {
            return;
        }

        playerOptionsDropdownTitle.textContent = item.title;
        playerOptionsDropdownList.innerHTML = '';

        item.options.forEach(function(option, index) {
            var li = document.createElement('li');
            var isSelected = option.label === item.value;
            li.className = 'player-dropdown-item';
            li.dataset.index = String(index);
            li.innerHTML = '<span>' + option.label + '</span><span class="player-dropdown-check">' + (isSelected ? 'Selected' : '') + '</span>';
            playerOptionsDropdownList.appendChild(li);
        });

        updatePlayerOptionsDropdownFocus();
    }

    function updatePlayerOptionsDropdownFocus() {
        var items = playerOptionsDropdownList.querySelectorAll('.player-dropdown-item');
        items.forEach(function(item, index) {
            item.classList.toggle('focused', index === focusedPlayerDropdownIndex);
        });
    }

    function openPlayerOptions() {
        renderPlayerOptions();
        if (!playerOptionItems.length) {
            showChannelBanner('No HLS.js options for current stream');
            return;
        }
        isPlayerOptionsVisible = true;
        isPlayerOptionsDropdownVisible = false;
        focusedPlayerOptionIndex = 0;
        updatePlayerOptionsFocus();
        playerOptionsDropdown.classList.add('hidden');
        playerOptions.classList.remove('hidden');
    }

    function closePlayerOptions() {
        isPlayerOptionsVisible = false;
        isPlayerOptionsDropdownVisible = false;
        playerOptionsDropdown.classList.add('hidden');
        playerOptions.classList.add('hidden');
    }

    function openPlayerOptionsDropdown() {
        var item = playerOptionItems[focusedPlayerOptionIndex];
        if (!item || !item.options || !item.options.length) {
            return;
        }

        var selectedIndex = item.options.findIndex(function(option) {
            return option.label === item.value;
        });
        focusedPlayerDropdownIndex = selectedIndex === -1 ? 0 : selectedIndex;
        isPlayerOptionsDropdownVisible = true;
        playerOptionsDropdown.classList.remove('hidden');
        renderPlayerOptionsDropdown();
    }

    function closePlayerOptionsDropdown() {
        isPlayerOptionsDropdownVisible = false;
        playerOptionsDropdown.classList.add('hidden');
    }

    function applyPlayerOptionSelection() {
        var item = playerOptionItems[focusedPlayerOptionIndex];
        if (!item || !item.options || !item.options[focusedPlayerDropdownIndex]) {
            return;
        }

        var selectedOption = item.options[focusedPlayerDropdownIndex];

        if (item.type === 'quality' && hlsPlayer) {
            hlsPlayer.currentLevel = selectedOption.value;
            hlsPlayer.nextLevel = selectedOption.value;
            hlsPlayer.loadLevel = selectedOption.value;
            item.value = selectedOption.label;
        }

        if (item.type === 'audio' && hlsPlayer) {
            hlsPlayer.audioTrack = selectedOption.value;
            item.value = selectedOption.label;
        }

        renderPlayerOptions();
        closePlayerOptionsDropdown();
    }

    function resetVideoElement() {
        video.pause();
        video.removeAttribute('src');
        while (video.firstChild) {
            video.removeChild(video.firstChild);
        }
        video.load();
    }

    function buildSearchResults(query) {
        var normalizedQuery = query.trim().toLowerCase();
        return channels.reduce(function(results, channel, index) {
            var matches = !normalizedQuery || channel.name.toLowerCase().includes(normalizedQuery);
            if (matches) {
                results.push({
                    channelIndex: index,
                    name: channel.name,
                    subtitle: isFavoritesView() && channel.playlistName ? channel.playlistName : channel.url
                });
            }
            return results;
        }, []);
    }

    function renderSearchResults() {
        channelSearchResults.innerHTML = '';
        searchResults.forEach(function(result, index) {
            var li = document.createElement('li');
            li.className = 'channel-search-item';
            li.dataset.index = String(index);
            li.innerHTML = '<div>' + result.name + '</div><div class="channel-search-subtitle">' + result.subtitle + '</div>';
            channelSearchResults.appendChild(li);
        });

        updateSearchFocus();
    }

    function updateSearchFocus() {
        var items = channelSearchResults.querySelectorAll('.channel-search-item');
        items.forEach(function(item, index) {
            item.classList.toggle('focused', index === focusedSearchIndex);
            if (index === focusedSearchIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });

        if (searchFocusArea === 'input') {
            channelSearchInput.focus();
        } else {
            channelSearchInput.blur();
        }
    }

    function refreshSearchResults() {
        searchResults = buildSearchResults(channelSearchInput.value);
        if (!searchResults.length) {
            focusedSearchIndex = 0;
        } else if (focusedSearchIndex >= searchResults.length) {
            focusedSearchIndex = searchResults.length - 1;
        }
        renderSearchResults();
    }

    function openSearch() {
        if (currentScreen !== 'player' || !channels.length) {
            return;
        }

        isSearchVisible = true;
        channelSearch.classList.remove('hidden');
        channelSearchInput.value = '';
        focusedSearchIndex = 0;
        searchFocusArea = 'input';
        refreshSearchResults();
        channelSearchInput.focus();
    }

    function closeSearch() {
        isSearchVisible = false;
        searchFocusArea = 'input';
        channelSearch.classList.add('hidden');
        channelSearchInput.blur();
    }

    function openSearchResult() {
        if (!searchResults.length || !searchResults[focusedSearchIndex]) {
            return;
        }

        var targetChannelIndex = searchResults[focusedSearchIndex].channelIndex;
        closeSearch();
        focusedChannelIndex = targetChannelIndex;
        isListVisible = false;
        channelList.classList.add('hidden');
        setTimeout(function() {
            loadChannel(targetChannelIndex);
        }, 0);
    }

    function registerRemoteKeys() {
        if (!window.tizen || !tizen.tvinputdevice || !tizen.tvinputdevice.registerKey) {
            return;
        }

        ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function(keyName) {
            try {
                tizen.tvinputdevice.registerKey(keyName);
            } catch (error) {
                console.warn('Failed to register remote key:', keyName, error);
            }
        });
    }

    async function initPlayer() {
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) {
            alert('Shaka Player is not supported on this device.');
            return;
        }

        player = new shaka.Player();
        await player.attach(video);

        player.configure({
            streaming: {
                gapDetectionThreshold: 0.5,
                gapJumpTimerTime: 0.25
            }
        });

        ui = new shaka.ui.Overlay(player, videoContainer, video);
        ui.configure({
            controlPanelElements: ['play_pause', 'time_and_duration', 'spacer', 'language', 'fullscreen', 'overflow_menu']
        });

        player.addEventListener('error', function(event) {
            console.error('Shaka Error:', event.detail);
        });

        registerRemoteKeys();
        loadSavedPlaylists();
        loadSavedFavorites();
        setScreen('home');
    }

    function logPlaybackDiagnostics(error, channelUrl) {
        var videoError = video.error ? {
            code: video.error.code,
            message: video.error.message || null
        } : null;

        console.warn('Playback diagnostics:', {
            url: channelUrl,
            shakaCode: error && error.code,
            shakaData: error && error.data,
            videoError: videoError,
            networkState: video.networkState,
            readyState: video.readyState,
            currentSrc: video.currentSrc
        });
    }

    async function tryHlsJsPlayback(channelUrl, requestId) {
        if (typeof Hls === 'undefined' || !Hls.isSupported()) {
            return false;
        }

        console.log('Trying Hls.js playback:', channelUrl);

        destroyHlsPlayer();

        try {
            await player.unload();
        } catch (error) {
            console.warn('Shaka unload before Hls.js playback failed:', error);
        }

        resetVideoElement();

        return await new Promise(function(resolve) {
            var settled = false;

            function finish(success) {
                if (settled) {
                    return;
                }
                settled = true;
                if (isStaleLoad(requestId)) {
                    resolve(false);
                    return;
                }
                resolve(success);
            }

            hlsPlayer = new Hls({
                enableWorker: true,
                lowLatencyMode: false
            });

            hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                if (isStaleLoad(requestId)) {
                    finish(false);
                    return;
                }
                video.play().then(function() {
                    finish(true);
                }).catch(function(error) {
                    console.warn('Hls.js video.play failed:', error);
                    finish(false);
                });
            });

            hlsPlayer.on(Hls.Events.ERROR, function(eventName, data) {
                console.warn('Hls.js error:', eventName, data);
                if (data && data.fatal) {
                    finish(false);
                }
            });

            try {
                hlsPlayer.loadSource(channelUrl);
                hlsPlayer.attachMedia(video);
            } catch (error) {
                console.warn('Hls.js attach/load failed:', error);
                finish(false);
            }
        });
    }

    async function playWithBestEngine(channelUrl, requestId) {
        var streamType = getStreamType(channelUrl);

        destroyHlsPlayer();
        resetVideoElement();

        if (isStaleLoad(requestId)) {
            throw new Error('Stale playback request');
        }

        if (streamType === 'hls') {
            var hlsJsWorked = await tryHlsJsPlayback(channelUrl, requestId);
            if (hlsJsWorked) {
                return 'hls.js';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            var hlsMimeType = getManifestMimeType(channelUrl);
            await player.load(channelUrl, null, hlsMimeType);
            return 'shaka-hls-fallback';
        }

        if (isStaleLoad(requestId)) {
            throw new Error('Stale playback request');
        }
        var manifestMimeType = getManifestMimeType(channelUrl);
        await player.load(channelUrl, null, manifestMimeType);
        return 'shaka';
    }

    async function loadChannel(index, retryCount) {
        if (retryCount === undefined) {
            retryCount = 0;
        }

        if (!channels.length) {
            return;
        }

        if (retryCount >= channels.length) {
            console.error('All channels failed to load.');
            alert('Unable to load any channels in this playlist.');
            returnToHome();
            return;
        }

        if (!channels[index]) {
            return;
        }

        var requestId = ++activeLoadRequestId;
        isChannelLoading = true;
        var channelUrl = channels[index].url;
        var streamType = getStreamType(channelUrl);

        console.log('Loading:', channels[index].name, channelUrl, streamType);
        try {
            var playbackEngine = await playWithBestEngine(channelUrl, requestId);
            if (isStaleLoad(requestId)) {
                return;
            }
            currentPlaybackEngine = playbackEngine;
            currentChannelIndex = index;
            focusedChannelIndex = index;
            isListVisible = false;
            channelList.classList.add('hidden');
            console.log('Playback engine:', playbackEngine);
            showChannelBanner((currentPlaylist ? currentPlaylist.name + ' | ' : '') + channels[index].name);
        } catch (e) {
            if (isStaleLoad(requestId)) {
                return;
            }
            console.warn('Channel failed:', channels[index].name, e && e.code, channelUrl, e);
            logPlaybackDiagnostics(e, channelUrl);

            var nextIndex = (index + 1) % channels.length;
            loadChannel(nextIndex, retryCount + 1);
        } finally {
            if (!isStaleLoad(requestId)) {
                isChannelLoading = false;
            }
        }
    }

    function toggleChannelList() {
        if (currentScreen !== 'player' || !channels.length) {
            return;
        }

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

    async function returnToHome() {
        activeLoadRequestId++;
        isChannelLoading = false;
        channels = [];
        currentPlaylist = null;
        currentChannelIndex = 0;
        focusedChannelIndex = 0;
        isListVisible = false;
        currentPlaybackEngine = null;
        channelList.classList.add('hidden');
        closePlayerOptions();
        closeSearch();

        try {
            await player.unload();
        } catch (error) {
            console.warn('Player unload failed:', error);
        }

        destroyHlsPlayer();
        resetVideoElement();

        setScreen('home');
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
        banner.innerHTML = '<span>' + channelName + '</span>';
        banner.style.display = 'flex';
        if (bannerHideTimer) {
            clearTimeout(bannerHideTimer);
        }
        bannerHideTimer = setTimeout(function() {
            banner.style.display = 'none';
            bannerHideTimer = null;
        }, 5000);
    }

    function handleHomeEnter() {
        var activeItem = playlistList.querySelector('.home-item[data-focus-index="' + homeFocusIndex + '"]');
        if (!activeItem) {
            return;
        }

        if (activeItem.dataset.role === 'add' || activeItem.dataset.role === 'input') {
            addPlaylist();
            return;
        }

        if (activeItem.dataset.role === 'favorites') {
            openFavorites();
            return;
        }

        if (activeItem.dataset.role === 'playlist') {
            focusedPlaylistIndex = Number(activeItem.dataset.entryIndex) - 1;
            if (homePlaylistActionMode === 'delete') {
                deletePlaylist(focusedPlaylistIndex);
            } else {
                openPlaylist(focusedPlaylistIndex);
            }
        }
    }

    playlistList.addEventListener('click', function(event) {
        var deleteButton = event.target.closest('.delete-playlist');
        if (deleteButton) {
            deletePlaylist(Number(deleteButton.dataset.index));
            return;
        }

        var playlistItem = event.target.closest('.playlist-item');
        if (playlistItem) {
            homeFocusIndex = Number(playlistItem.dataset.focusIndex);
            homePlaylistActionMode = 'open';
            syncHomeFocus();

            if (playlistItem.dataset.role === 'favorites') {
                openFavorites();
            } else {
                focusedPlaylistIndex = Number(playlistItem.dataset.entryIndex) - 1;
                openPlaylist(focusedPlaylistIndex);
            }
        }
    });

    playlistUrlInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addPlaylist();
        }
    });

    channelSearchInput.addEventListener('input', function() {
        focusedSearchIndex = 0;
        refreshSearchResults();
    });

    channelSearchResults.addEventListener('click', function(event) {
        var item = event.target.closest('.channel-search-item');
        if (!item) {
            return;
        }
        focusedSearchIndex = Number(item.dataset.index);
        updateSearchFocus();
        openSearchResult();
    });

    document.addEventListener('keydown', function(event) {
        var keyCode = event.keyCode;
        var isBackKey = event.key === 'Back' || event.key === 'XF86Back' || String(keyCode) === '10009';
        var isRedKey = keyCode === 403 || event.key === 'ColorF0Red' || event.code === 'ColorF0Red';
        var isGreenKey = keyCode === 404 || event.key === 'ColorF1Green' || event.code === 'ColorF1Green';
        var isYellowKey = keyCode === 405 || event.key === 'ColorF2Yellow' || event.code === 'ColorF2Yellow';

        if (currentScreen === 'home') {
            switch (event.key) {
                case 'ArrowUp':
                    homePlaylistActionMode = 'open';
                    moveHomeFocus(-1);
                    event.preventDefault();
                    return;
                case 'ArrowDown':
                    homePlaylistActionMode = 'open';
                    moveHomeFocus(1);
                    event.preventDefault();
                    return;
                case 'ArrowLeft':
                    if (playlistList.querySelector('.home-item[data-focus-index="' + homeFocusIndex + '"]')?.dataset.role === 'playlist') {
                        homePlaylistActionMode = 'open';
                        syncHomeFocus();
                        event.preventDefault();
                        return;
                    }
                    break;
                case 'ArrowRight':
                    if (playlistList.querySelector('.home-item[data-focus-index="' + homeFocusIndex + '"]')?.dataset.role === 'playlist') {
                        homePlaylistActionMode = 'delete';
                        syncHomeFocus();
                        event.preventDefault();
                        return;
                    }
                    break;
                case 'Enter':
                case 'Select':
                    handleHomeEnter();
                    event.preventDefault();
                    return;
            }

            if (isBackKey) {
                if (confirm('Exit TVapp?')) {
                    tizen.application.getCurrentApplication().exit();
                }
                event.preventDefault();
            }
            return;
        }

        if (isSearchVisible) {
            switch (event.key) {
                case 'ArrowUp':
                    if (searchFocusArea === 'results' && searchResults.length) {
                        if (focusedSearchIndex === 0) {
                            searchFocusArea = 'input';
                            updateSearchFocus();
                        } else {
                            focusedSearchIndex = (focusedSearchIndex - 1 + searchResults.length) % searchResults.length;
                            updateSearchFocus();
                        }
                    } else {
                        searchFocusArea = 'input';
                        updateSearchFocus();
                    }
                    event.preventDefault();
                    return;
                case 'ArrowDown':
                    if (searchResults.length) {
                        if (searchFocusArea === 'input') {
                            searchFocusArea = 'results';
                            focusedSearchIndex = 0;
                        } else {
                            focusedSearchIndex = (focusedSearchIndex + 1) % searchResults.length;
                        }
                        updateSearchFocus();
                    }
                    event.preventDefault();
                    return;
                case 'Enter':
                case 'Select':
                    if (searchFocusArea === 'results') {
                        openSearchResult();
                    } else if (searchResults.length) {
                        searchFocusArea = 'results';
                        focusedSearchIndex = 0;
                        updateSearchFocus();
                    }
                    event.preventDefault();
                    return;
            }

            if (isBackKey || isYellowKey) {
                closeSearch();
                event.preventDefault();
                return;
            }

            return;
        }

        if (isPlayerOptionsVisible) {
            if (!playerOptionItems.length) {
                closePlayerOptions();
                event.preventDefault();
                return;
            }

            if (isPlayerOptionsDropdownVisible) {
                switch (event.key) {
                    case 'ArrowUp':
                        focusedPlayerDropdownIndex = (focusedPlayerDropdownIndex - 1 + playerOptionItems[focusedPlayerOptionIndex].options.length) % playerOptionItems[focusedPlayerOptionIndex].options.length;
                        updatePlayerOptionsDropdownFocus();
                        event.preventDefault();
                        return;
                    case 'ArrowDown':
                        focusedPlayerDropdownIndex = (focusedPlayerDropdownIndex + 1) % playerOptionItems[focusedPlayerOptionIndex].options.length;
                        updatePlayerOptionsDropdownFocus();
                        event.preventDefault();
                        return;
                    case 'Enter':
                    case 'Select':
                        applyPlayerOptionSelection();
                        event.preventDefault();
                        return;
                }

                if (isBackKey) {
                    closePlayerOptionsDropdown();
                    event.preventDefault();
                    return;
                }

                return;
            }

            switch (event.key) {
                case 'ArrowUp':
                    focusedPlayerOptionIndex = (focusedPlayerOptionIndex - 1 + playerOptionItems.length) % playerOptionItems.length;
                    updatePlayerOptionsFocus();
                    event.preventDefault();
                    return;
                case 'ArrowDown':
                    focusedPlayerOptionIndex = (focusedPlayerOptionIndex + 1) % playerOptionItems.length;
                    updatePlayerOptionsFocus();
                    event.preventDefault();
                    return;
                case 'Enter':
                case 'Select':
                    openPlayerOptionsDropdown();
                    event.preventDefault();
                    return;
            }

            if (isBackKey || isGreenKey) {
                closePlayerOptions();
                event.preventDefault();
                return;
            }

            return;
        }

        if (isRedKey) {
            if (isListVisible) {
                toggleFavoriteByIndex(focusedChannelIndex);
                rebuildUIList();
                updateListFocus();
            } else {
                toggleFavoriteByIndex(currentChannelIndex);
                rebuildUIList();
            }
            event.preventDefault();
            return;
        }

        if (isGreenKey) {
            openPlayerOptions();
            event.preventDefault();
            return;
        }

        if (isYellowKey) {
            openSearch();
            event.preventDefault();
            return;
        }

        switch (event.key) {
            case 'Enter':
            case 'Select':
                if (!isListVisible) {
                    toggleChannelList();
                } else {
                    loadChannel(focusedChannelIndex);
                }
                break;
            case 'ArrowUp':
                if (!channels.length) {
                    break;
                }
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex - 1 + channels.length) % channels.length;
                    updateListFocus();
                } else if (!isChannelLoading) {
                    loadChannel((currentChannelIndex + 1) % channels.length);
                }
                break;
            case 'ArrowDown':
                if (!channels.length) {
                    break;
                }
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex + 1) % channels.length;
                    updateListFocus();
                } else if (!isChannelLoading) {
                    loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
                }
                break;
        }

        if (isBackKey) {
            if (isListVisible) {
                toggleChannelList();
            } else {
                returnToHome();
            }
            event.preventDefault();
            return;
        }

        if (keyCode === 427 && channels.length && !isChannelLoading) {
            loadChannel((currentChannelIndex + 1) % channels.length);
        }
        if (keyCode === 428 && channels.length && !isChannelLoading) {
            loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
        }
    });

    initPlayer();
});
