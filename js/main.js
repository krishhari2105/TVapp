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
    var avPlayState = 'NONE';
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
    var playerOptionsRefreshTimer = null;
    var homePlaylistActionMode = 'open';
    var activeLoadRequestId = 0;
    var isChannelLoading = false;
    var bannerHideTimer = null;
    var isSearchVisible = false;
    var searchResults = [];
    var focusedSearchIndex = 0;
    var searchFocusArea = 'input';
    var activeSubtitleValue = 'Off';
    var hlsSubtitleManifestCache = {};
    var textTrackRegistry = [];
    var textTrackSequence = 0;
    var currentLoadInitialTextTracks = [];
    var useFreshSubtitleSessionOnNextPlaybackStart = false;

    var PLAYLIST_STORAGE_KEY = 'tvapp.playlists';
    var FAVORITES_STORAGE_KEY = 'tvapp.favorites';
    var HOME_ACTION_COUNT = 2;
    var DEFAULT_PLAYLISTS = [
        {
            id: createId(),
            name: 'playlist.php',
            url: 'http://192.168.1.3:8080/JioTv/playlist.php'
        },
        {
            id: createId(),
            name: 'play',
            url: 'http://192.168.1.3:8080/play.m3u'
        },
        {
            id: createId(),
            name: 'strms',
            url: 'http://192.168.1.3:8080/strms.m3u'
        },
        {
            id: createId(),
            name: 'tam',
            url: 'https://iptv-org.github.io/iptv/languages/tam.m3u'
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
            subtitles: Array.isArray(channel.subtitles) ? channel.subtitles : [],
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

        function parseSubtitleAttributeValue(value) {
            return String(value || '')
                .split(/[;,]/)
                .map(function(part) { return part.trim(); })
                .filter(Boolean)
                .map(function(part, index) {
                    var pieces = part.split('|').map(function(item) { return item.trim(); }).filter(Boolean);
                    var url = pieces[0];
                    if (!url || !/^https?:\/\//i.test(url)) {
                        return null;
                    }
                    return {
                        id: 'ext-sub-' + index,
                        label: pieces[1] || ('Subtitle ' + (index + 1)),
                        language: pieces[2] || '',
                        codec: (pieces[3] || url.split('.').pop() || 'vtt').toLowerCase(),
                        url: url
                    };
                })
                .filter(Boolean);
        }

        lines.forEach(function(rawLine) {
            var line = rawLine.trim();
            if (line.startsWith('#EXTINF')) {
                var nameMatch = line.match(/,(.+)$/);
                currentChannel.name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';

                var logoMatch = line.match(/tvg-logo="([^"]+)"/);
                currentChannel.logo = logoMatch ? logoMatch[1] : null;
                currentChannel.subtitles = [];

                [
                    'subtitles',
                    'subtitle-url',
                    'subtitle_url',
                    'sub-url',
                    'sub_file',
                    'sub-file',
                    'tvg-subtitle'
                ].forEach(function(attrName) {
                    var pattern = new RegExp(attrName + '="([^"]+)"', 'i');
                    var match = line.match(pattern);
                    if (match && match[1]) {
                        currentChannel.subtitles = currentChannel.subtitles.concat(parseSubtitleAttributeValue(match[1]));
                    }
                });
            } else if (line.startsWith('http')) {
                currentChannel.url = line.split('|')[0];
                parsedChannels.push({
                    name: currentChannel.name || 'Unknown Channel',
                    logo: currentChannel.logo || null,
                    subtitles: currentChannel.subtitles || [],
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
        if (normalizedUrl.includes('.ts')) {
            return 'video/mp2t';
        }
        return undefined;
    }

    function getStreamType(url) {
        var normalizedUrl = String(url || '').toLowerCase();
        if (
            normalizedUrl.includes('jmp2.uk/') ||
            normalizedUrl.includes('pluto.tv/') ||
            normalizedUrl.includes('stitcher-ipv4.pluto.tv/')
        ) {
            return 'hls-stitch';
        }
        if (normalizedUrl.includes('live.php') || normalizedUrl.includes('wanda.php')) {
            return 'hls-wrapper';
        }
        if (
            normalizedUrl.includes('.m3u8') ||
            normalizedUrl.includes('.m3u') ||
            normalizedUrl.includes('playlist.php')
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

    async function detectHlsSubtitleMetadata(channelUrl) {
        if (!channelUrl) {
            return false;
        }

        if (Object.prototype.hasOwnProperty.call(hlsSubtitleManifestCache, channelUrl)) {
            return hlsSubtitleManifestCache[channelUrl];
        }

        try {
            var response = await fetch(channelUrl, { method: 'GET' });
            if (!response.ok) {
                hlsSubtitleManifestCache[channelUrl] = false;
                return false;
            }

            var manifestText = await response.text();
            var hasSubtitleGroupReference = /#EXT-X-STREAM-INF:.*SUBTITLES\s*=\s*(?:"[^"]+"|[^,\s]+)/i.test(manifestText);
            var hasClosedCaptionGroupReference = /#EXT-X-STREAM-INF:.*CLOSED-CAPTIONS\s*=\s*(?:"(?!NONE")[^"]+"|(?!NONE\b)[^,\s]+)/i.test(manifestText);
            var hasSubtitleMetadata =
                /#EXT-X-MEDIA:.*TYPE=SUBTITLES/i.test(manifestText) ||
                /#EXT-X-MEDIA:.*TYPE=CLOSED-CAPTIONS/i.test(manifestText) ||
                hasSubtitleGroupReference ||
                hasClosedCaptionGroupReference;

            hlsSubtitleManifestCache[channelUrl] = hasSubtitleMetadata;
            return hasSubtitleMetadata;
        } catch (error) {
            hlsSubtitleManifestCache[channelUrl] = false;
            return false;
        }
    }

    function destroyHlsPlayer() {
        if (hlsPlayer) {
            hlsPlayer.destroy();
            hlsPlayer = null;
        }
    }

    function hasAvPlay() {
        return !!(window.webapis && webapis.avplay);
    }

    function setAvPlayMode(active) {
        document.body.classList.toggle('avplay-active', !!active);
        videoContainer.classList.toggle('avplay-active', !!active);
    }

    function hideHtmlVideoElement() {
        video.style.visibility = 'hidden';
    }

    function showHtmlVideoElement() {
        video.style.visibility = 'visible';
    }

    function getVideoDisplayRect() {
        var rect = videoContainer.getBoundingClientRect();
        return {
            left: Math.max(0, Math.round(rect.left)),
            top: Math.max(0, Math.round(rect.top)),
            width: Math.max(1, Math.round(rect.width || window.innerWidth || 1920)),
            height: Math.max(1, Math.round(rect.height || window.innerHeight || 1080))
        };
    }

    function updateAvPlayDisplayRect() {
        if (!hasAvPlay() || avPlayState === 'NONE') {
            return;
        }

        var rect = getVideoDisplayRect();
        try {
            webapis.avplay.setDisplayRect(rect.left, rect.top, rect.width, rect.height);
        } catch (error) {
            console.warn('AVPlay setDisplayRect failed:', error);
        }
    }

    function stopAvPlay() {
        if (!hasAvPlay() || avPlayState === 'NONE') {
            setAvPlayMode(false);
            return;
        }

        try {
            if (avPlayState === 'PLAYING' || avPlayState === 'PAUSED') {
                webapis.avplay.stop();
            }
        } catch (error) {
            console.warn('AVPlay stop failed:', error);
        }

        try {
            webapis.avplay.close();
        } catch (error) {
            console.warn('AVPlay close failed:', error);
        }

        avPlayState = 'NONE';
        setAvPlayMode(false);
        showHtmlVideoElement();
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
        if (currentPlaybackEngine && currentPlaybackEngine.indexOf('avplay') === 0) {
            var avPlayAudioTracks = getAvPlayAudioTracks();
            if (!avPlayAudioTracks.length) {
                return 'Unavailable';
            }
            var selectedAvPlayAudio = avPlayAudioTracks.find(function(track) {
                return track.index === getAvPlaySelectedTrackIndex('AUDIO');
            }) || avPlayAudioTracks[0];
            return selectedAvPlayAudio.label;
        }

        if (!hlsPlayer || !hlsPlayer.audioTracks || !hlsPlayer.audioTracks.length) {
            return 'Unavailable';
        }

        var track = hlsPlayer.audioTracks[hlsPlayer.audioTrack];
        if (!track) {
            return 'Default';
        }

        return track.name || track.lang || ('Track ' + (hlsPlayer.audioTrack + 1));
    }

    function getCurrentSubtitleText() {
        var tracks = getNativeSubtitleTracks();
        var active = tracks.find(function(t) { return t.value === activeSubtitleValue; });
        return active ? active.label : 'Off';
    }

    function resetSubtitleTrackingState() {
        textTrackRegistry = [];
        currentLoadInitialTextTracks = [];
        activeSubtitleValue = 'Off';
    }

    function pruneTextTrackRegistry() {
        if (!video || !video.textTracks) {
            textTrackRegistry = [];
            return;
        }

        var currentTracks = [];
        for (var i = 0; i < video.textTracks.length; i++) {
            currentTracks.push(video.textTracks[i]);
        }

        textTrackRegistry = textTrackRegistry.filter(function(entry) {
            return currentTracks.indexOf(entry.track) !== -1;
        });
    }

    function isTrackBackedByDomNode(track) {
        if (!video) {
            return false;
        }

        var trackNodes = video.querySelectorAll('track');
        for (var i = 0; i < trackNodes.length; i++) {
            if (trackNodes[i].track === track) {
                return true;
            }
        }

        return false;
    }

    function captureInitialTextTracksForLoad() {
        currentLoadInitialTextTracks = [];
        if (!video || !video.textTracks) {
            return;
        }

        for (var i = 0; i < video.textTracks.length; i++) {
            currentLoadInitialTextTracks.push(video.textTracks[i]);
        }
    }

    function observeCurrentDomTextTracks(reason) {
        if (!video || !video.textTracks) {
            return false;
        }

        var changed = false;

        for (var i = 0; i < video.textTracks.length; i++) {
            var track = video.textTracks[i];
            if (isTrackBackedByDomNode(track)) {
                continue;
            }

            if (getTextTrackLoadId(track) !== -1) {
                continue;
            }

            if (currentLoadInitialTextTracks.indexOf(track) !== -1) {
                continue;
            }

            registerTextTrack(track, activeLoadRequestId);
            if (isEmbeddedCaptionTrack(track)) {
                setTextTrackSource(track, 'embedded');
            } else if (doesDomTextTrackMatchAnyHlsManifestTrack(track)) {
                setTextTrackSource(track, 'hls');
            }

            changed = true;
        }

        return changed;
    }

    function getTextTrackMeta(track) {
        for (var i = 0; i < textTrackRegistry.length; i++) {
            if (textTrackRegistry[i].track === track) {
                return textTrackRegistry[i];
            }
        }
        return null;
    }

    function registerTextTrack(track, loadId) {
        if (!track) {
            return null;
        }

        var meta = getTextTrackMeta(track);
        if (meta) {
            meta.loadId = loadId;
            return meta;
        }

        meta = {
            track: track,
            loadId: loadId,
            sourceType: 'unknown',
            sequence: ++textTrackSequence
        };
        textTrackRegistry.push(meta);
        return meta;
    }

    function setTextTrackSource(track, sourceType) {
        var meta = registerTextTrack(track, getTextTrackLoadId(track) === -1 ? activeLoadRequestId : getTextTrackLoadId(track));
        if (!meta) {
            return null;
        }

        meta.sourceType = sourceType;
        return meta;
    }

    function getTextTrackSource(track) {
        var meta = getTextTrackMeta(track);
        return meta ? meta.sourceType : 'unknown';
    }

    function getTextTrackLoadId(track) {
        var meta = getTextTrackMeta(track);
        return meta ? meta.loadId : -1;
    }

    function markExistingTextTracksAsStale(loadId) {
        if (!video || !video.textTracks) {
            return;
        }

        pruneTextTrackRegistry();
        for (var i = 0; i < video.textTracks.length; i++) {
            var meta = registerTextTrack(video.textTracks[i], loadId - 1);
            if (meta) {
                meta.sourceType = 'unknown';
            }
        }
    }

    function getSubtitleLabel(label, fallback) {
        var normalizedLabel = String(label || '').trim();
        return normalizedLabel || fallback;
    }

    function formatSubtitleOptionLabel(label, sourceType) {
        var suffixMap = {
            external: 'External',
            hls: 'HLS',
            embedded: 'Embedded'
        };
        var suffix = suffixMap[sourceType];
        return suffix ? (label + ' (' + suffix + ')') : label;
    }

    function normalizeSubtitleIdentity(value) {
        return String(value || '').trim().toLowerCase();
    }

    function isEmbeddedCaptionTrack(track) {
        if (!track) {
            return false;
        }

        var label = getSubtitleLabel(track.label || track.language, '');
        return track.kind === 'captions' || /^cc\d+$/i.test(label) || getTextTrackSource(track) === 'embedded';
    }

    function domTextTrackMatchesHlsManifestTrack(track, manifestTrack) {
        if (!track || !manifestTrack || isEmbeddedCaptionTrack(track)) {
            return false;
        }

        var trackLabel = normalizeSubtitleIdentity(getSubtitleLabel(track.label || track.language, ''));
        var trackLang = normalizeSubtitleIdentity(track.language);
        var manifestLabel = normalizeSubtitleIdentity(getSubtitleLabel(manifestTrack.name || manifestTrack.lang, ''));
        var manifestLang = normalizeSubtitleIdentity(manifestTrack.lang);

        if (manifestLabel && trackLabel === manifestLabel) {
            return true;
        }

        if (manifestLang && (trackLang === manifestLang || trackLabel === manifestLang)) {
            return true;
        }

        return false;
    }

    function doesDomTextTrackMatchAnyHlsManifestTrack(track) {
        if (!track || !hlsPlayer || !hlsPlayer.subtitleTracks) {
            return false;
        }

        for (var i = 0; i < hlsPlayer.subtitleTracks.length; i++) {
            if (domTextTrackMatchesHlsManifestTrack(track, hlsPlayer.subtitleTracks[i])) {
                return true;
            }
        }

        return false;
    }

    function findDomTextTrackIndex(matchFn) {
        if (!video || !video.textTracks) {
            return -1;
        }

        for (var i = 0; i < video.textTracks.length; i++) {
            var track = video.textTracks[i];
            var isTrackNode = false;
            var trackNodes = video.querySelectorAll('track');
            for (var j = 0; j < trackNodes.length; j++) {
                if (trackNodes[j].track === track) {
                    isTrackNode = true;
                    break;
                }
            }
            if (isTrackNode) {
                continue;
            }
            if (matchFn(track, i)) {
                return i;
            }
        }

        return -1;
    }

    function getActiveHlsSubtitleIndex() {
        if (typeof activeSubtitleValue !== 'string' || activeSubtitleValue.indexOf('hls:') !== 0) {
            return -1;
        }

        var index = parseInt(activeSubtitleValue.split(':')[1], 10);
        return isNaN(index) ? -1 : index;
    }

    function findMatchingHlsDomTextTrackIndex(hlsIndex) {
        if (
            !video ||
            !video.textTracks ||
            !hlsPlayer ||
            !hlsPlayer.subtitleTracks ||
            !hlsPlayer.subtitleTracks[hlsIndex]
        ) {
            return -1;
        }

        observeCurrentDomTextTracks('hls-match');

        var selectedHlsTrack = hlsPlayer.subtitleTracks[hlsIndex];
        var selectedLabel = getSubtitleLabel(selectedHlsTrack.name || selectedHlsTrack.lang, '').toLowerCase();
        var selectedLang = String(selectedHlsTrack.lang || '').trim().toLowerCase();
        var candidates = [];

        for (var i = 0; i < video.textTracks.length; i++) {
            var track = video.textTracks[i];
            var isTrackNode = false;
            var trackNodes = video.querySelectorAll('track');
            for (var j = 0; j < trackNodes.length; j++) {
                if (trackNodes[j].track === track) {
                    isTrackNode = true;
                    break;
                }
            }
            if (isTrackNode) {
                continue;
            }
            if (getTextTrackLoadId(track) !== activeLoadRequestId) {
                continue;
            }
            if (track.kind !== 'subtitles') {
                continue;
            }
            if (isEmbeddedCaptionTrack(track)) {
                continue;
            }

            var meta = getTextTrackMeta(track);
            candidates.push({
                index: i,
                sourceType: getTextTrackSource(track),
                label: getSubtitleLabel(track.label || track.language, '').toLowerCase(),
                lang: String(track.language || '').trim().toLowerCase(),
                mode: track.mode,
                sequence: meta ? meta.sequence : 0
            });
        }

        if (!candidates.length) {
            return -1;
        }

        var explicitHls = candidates.find(function(candidate) {
            return candidate.sourceType === 'hls';
        });
        if (explicitHls) {
            return explicitHls.index;
        }

        var matchingCandidates = candidates.filter(function(candidate) {
            return (
                (selectedLabel && candidate.label === selectedLabel) ||
                (selectedLang && (candidate.lang === selectedLang || candidate.label === selectedLang))
            );
        });
        if (matchingCandidates.length === 1) {
            return matchingCandidates[0].index;
        }
        if (matchingCandidates.length > 1) {
            matchingCandidates.sort(function(a, b) {
                if (a.mode === 'showing' && b.mode !== 'showing') return -1;
                if (b.mode === 'showing' && a.mode !== 'showing') return 1;
                return b.sequence - a.sequence;
            });
            return matchingCandidates[0].index;
        }

        if (candidates.length === 1) {
            return candidates[0].index;
        }

        var showingCandidate = candidates.find(function(candidate) {
            return candidate.mode === 'showing';
        });
        if (showingCandidate) {
            return showingCandidate.index;
        }

        candidates.sort(function(a, b) {
            return b.sequence - a.sequence;
        });
        return candidates[0].index;
    }

    function syncActiveHlsSubtitleTrack(reason) {
        var hlsIndex = getActiveHlsSubtitleIndex();
        if (hlsIndex === -1 || !hlsPlayer || !hlsPlayer.subtitleTracks || !hlsPlayer.subtitleTracks[hlsIndex]) {
            return;
        }

        hlsPlayer.subtitleDisplay = true;
        if (hlsPlayer.subtitleTrack !== hlsIndex) {
            hlsPlayer.subtitleTrack = hlsIndex;
        }

        var domTrackIndex = findMatchingHlsDomTextTrackIndex(hlsIndex);
        if (domTrackIndex === -1 || !video.textTracks[domTrackIndex]) {
            return;
        }

        for (var resetIndex = 0; resetIndex < video.textTracks.length; resetIndex++) {
            if (resetIndex === domTrackIndex) {
                continue;
            }
            if (getTextTrackLoadId(video.textTracks[resetIndex]) !== activeLoadRequestId) {
                continue;
            }
            if (getTextTrackSource(video.textTracks[resetIndex]) === 'hls') {
                setTextTrackSource(video.textTracks[resetIndex], 'unknown');
            }
        }
        setTextTrackSource(video.textTracks[domTrackIndex], 'hls');

        for (var i = 0; i < video.textTracks.length; i++) {
            if (getTextTrackLoadId(video.textTracks[i]) !== activeLoadRequestId) {
                continue;
            }
            if (video.textTracks[i].kind === 'subtitles') {
                video.textTracks[i].mode = i === domTrackIndex ? 'showing' : 'disabled';
            }
        }

    }

    function getNativeSubtitleTracks() {
        var combinedTracks = [];
        var seen = {};
        pruneTextTrackRegistry();
        observeCurrentDomTextTracks('native-track-scan');

        var channel = channels[currentChannelIndex];
        if (channel && Array.isArray(channel.subtitles)) {
            channel.subtitles.forEach(function(sub, index) {
                var label = getSubtitleLabel(sub.label || sub.language, 'External ' + (index + 1));
                var key = 'external|' + label.toLowerCase() + '|' + index;
                if (!seen[key]) {
                    seen[key] = true;
                    combinedTracks.push({
                        label: formatSubtitleOptionLabel(label, 'external'),
                        value: 'external:' + index
                    });
                }
            });
        }

        var domTracksList = [];
        if (hlsPlayer && hlsPlayer.subtitleTracks) {
            for (var m = 0; m < hlsPlayer.subtitleTracks.length; m++) {
                var t = hlsPlayer.subtitleTracks[m];
                var manifestLabel = getSubtitleLabel(t.name || t.lang, 'Track ' + (m + 1));
                var manifestKey = manifestLabel.toLowerCase();
                var hlsTrackKey = 'hls|' + manifestKey + '|' + m;
                if (!seen[hlsTrackKey]) {
                    seen[hlsTrackKey] = true;
                    combinedTracks.push({
                        label: formatSubtitleOptionLabel(manifestLabel, 'hls'),
                        value: 'hls:' + m
                    });
                }
            }
        }

        var isShakaActive = currentPlaybackEngine && currentPlaybackEngine.indexOf('shaka') !== -1;
        var isHlsJsActive = currentPlaybackEngine && currentPlaybackEngine.indexOf('hls.js') !== -1;

        if (video && video.textTracks) {
            // Iterate backwards to bypass stale "ghost" tracks from previous streams
            for (var i = video.textTracks.length - 1; i >= 0; i--) {
                var vt = video.textTracks[i];
                var isTrackNode = false;
                var trackNodes = video.querySelectorAll('track');
                for (var k = 0; k < trackNodes.length; k++) {
                    if (trackNodes[k].track === vt) isTrackNode = true;
                }
                if (isTrackNode) continue;

                if (vt.kind === 'subtitles' || vt.kind === 'captions') {
                    var label = getSubtitleLabel(vt.label || vt.language, 'Track ' + (i + 1));
                    var key = label.toLowerCase();
                    var isCurrentLoadTrack = getTextTrackLoadId(vt) === activeLoadRequestId;
                    var matchesHlsManifestTrack = doesDomTextTrackMatchAnyHlsManifestTrack(vt);
                    var isEmbedded = isEmbeddedCaptionTrack(vt) || (isHlsJsActive && !matchesHlsManifestTrack);
                    var isSelectableDomTrack = isCurrentLoadTrack && !matchesHlsManifestTrack && (
                        isEmbedded ||
                        isShakaActive
                    );

                    if (isSelectableDomTrack) {
                        domTracksList.push({
                            label: formatSubtitleOptionLabel(label, 'embedded'),
                            value: 'html5:' + i,
                            key: 'embedded|' + key + '|' + i
                        });
                    }
                }
            }
        }

        var deduplicatedDomTracks = [];
        domTracksList.forEach(function(t) {
            if (!seen[t.key]) {
                seen[t.key] = true;
                deduplicatedDomTracks.push(t);
            }
        });

        deduplicatedDomTracks.reverse().forEach(function(t) {
            combinedTracks.push({ label: t.label, value: t.value });
        });

        return combinedTracks;
    }

    function disableAllSubtitles() {
        if (video && video.textTracks) {
            for (var i = 0; i < video.textTracks.length; i++) {
                video.textTracks[i].mode = 'disabled';
            }
        }
        if (hlsPlayer) {
            hlsPlayer.subtitleDisplay = false;
            hlsPlayer.subtitleTrack = -1;
        }
        if (player) {
            try { player.setTextTrackVisibility(false); } catch(e){}
        }
        activeSubtitleValue = 'Off';
    }

    function setSubtitleTrack(value) {
        disableAllSubtitles();

        var oldTracks = video.querySelectorAll('track');
        oldTracks.forEach(function(t) { t.remove(); });

        if (value === 'Off' || value === -1) {
            return;
        }

        activeSubtitleValue = value;
        var parts = String(value).split(':');
        var type = parts[0];
        var index = parseInt(parts[1], 10);

        if (type === 'external') {
            var channel = channels[currentChannelIndex];
            if (channel && channel.subtitles && channel.subtitles[index]) {
                var sub = channel.subtitles[index];
                var track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.label || sub.language || ('External ' + (index + 1));
                track.srclang = sub.language || 'en';
                track.src = sub.url;
                track.default = true;
                video.appendChild(track);
                if (track.track) {
                    track.track.mode = 'showing';
                }
            }
        } else if (type === 'hls' && hlsPlayer && hlsPlayer.subtitleTracks && hlsPlayer.subtitleTracks[index]) {
            syncActiveHlsSubtitleTrack('user-selection');
        } else if (type === 'html5' && video && video.textTracks[index]) {
            setTextTrackSource(video.textTracks[index], 'embedded');
            video.textTracks[index].mode = 'showing';
        }
    }

    function getAvPlayAudioTracks() {
        if (!hasAvPlay() || !webapis.avplay.getTotalTrackInfo) {
            return [];
        }

        try {
            return webapis.avplay.getTotalTrackInfo()
                .filter(function(track) { return track.type === 'AUDIO'; })
                .map(function(track, index) {
                    var info = track.extra_info || '';
                    var langMatch = /language=([^|]+)/i.exec(info);
                    var nameMatch = /name=([^|]+)/i.exec(info);
                    return {
                        index: track.index,
                        label: (nameMatch && nameMatch[1]) || (langMatch && langMatch[1]) || ('Track ' + (index + 1))
                    };
                });
        } catch (error) {
            return [];
        }
    }

    function getAvPlaySelectedTrackIndex(type) {
        if (!hasAvPlay() || !webapis.avplay.getCurrentStreamInfo) {
            return -1;
        }

        try {
            var info = webapis.avplay.getCurrentStreamInfo() || [];
            var track = info.find(function(item) { return item.type === type; });
            return track ? track.index : -1;
        } catch (error) {
            return -1;
        }
    }

    function buildPlayerOptionItems() {
        var items = [];
        var isHlsJs = currentPlaybackEngine === 'hls.js' || currentPlaybackEngine === 'hls.js-wrapper';
        var isAvPlay = currentPlaybackEngine && currentPlaybackEngine.indexOf('avplay') === 0;

        if (isHlsJs && hlsPlayer) {
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
        }

        if (isHlsJs && hlsPlayer && hlsPlayer.audioTracks && hlsPlayer.audioTracks.length) {
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

        if (isAvPlay) {
            var avPlayAudioTracks = getAvPlayAudioTracks();
            if (avPlayAudioTracks.length) {
                items.push({
                    type: 'audio',
                    title: 'Audio',
                    value: getCurrentAudioText(),
                    options: avPlayAudioTracks.map(function(track) {
                        return {
                            label: track.label,
                            value: track.index
                        };
                    })
                });
            }
        }

        var selectableSubtitleTracks = getNativeSubtitleTracks();
        if (selectableSubtitleTracks.length) {
            items.push({
                type: 'subtitle',
                title: 'Subtitles',
                value: getCurrentSubtitleText(),
                options: [{ label: 'Off', value: 'Off' }].concat(selectableSubtitleTracks.map(function(track) {
                    return {
                        label: track.label,
                        value: track.value
                    };
                }))
            });
        }

        if (!items.length) {
            return [];
        }

        return items;
    }

    function schedulePlayerOptionsRefresh(reason) {
        if (!isPlayerOptionsVisible) {
            return;
        }

        if (playerOptionsRefreshTimer) {
            clearTimeout(playerOptionsRefreshTimer);
        }

        playerOptionsRefreshTimer = setTimeout(function() {
            playerOptionsRefreshTimer = null;
            if (!isPlayerOptionsVisible) {
                return;
            }

            renderPlayerOptions();
            if (isPlayerOptionsDropdownVisible) {
                renderPlayerOptionsDropdown();
            }
        }, 150);
    }

    function renderPlayerOptions() {
        playerOptionItems = buildPlayerOptionItems();
        playerOptionsList.innerHTML = '';

        if (!playerOptionItems.length) {
            playerOptionsHint.textContent = 'No player options are available for the current playback.';
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
            showChannelBanner('No player options for current stream');
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

        if (item.type === 'audio' && currentPlaybackEngine && currentPlaybackEngine.indexOf('avplay') === 0 && hasAvPlay()) {
            try {
                webapis.avplay.setSelectTrack('AUDIO', selectedOption.value);
                item.value = selectedOption.label;
            } catch (error) {
                console.warn('AVPlay audio track switch failed:', error);
            }
        }

        if (item.type === 'subtitle') {
            setSubtitleTrack(selectedOption.value);
            item.value = selectedOption.label;
        }

        renderPlayerOptions();
        closePlayerOptionsDropdown();
    }

    function resetVideoElement() {
        setAvPlayMode(false);
        showHtmlVideoElement();
        disableAllSubtitles();
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

    function bindVideoTextTrackEvents() {
        if (!video || !video.textTracks) {
            return;
        }

        video.textTracks.addEventListener('addtrack', function(event) {
            registerTextTrack(event.track, activeLoadRequestId);
            if (isEmbeddedCaptionTrack(event.track)) {
                setTextTrackSource(event.track, 'embedded');
            }
            if (
                event.track &&
                event.track.kind === 'subtitles' &&
                doesDomTextTrackMatchAnyHlsManifestTrack(event.track)
            ) {
                setTextTrackSource(event.track, 'hls');
            }
            if (activeSubtitleValue === 'Off' && event.track) {
                event.track.mode = 'disabled';
            }
            if (getActiveHlsSubtitleIndex() !== -1) {
                syncActiveHlsSubtitleTrack('dom-addtrack');
            }
            schedulePlayerOptionsRefresh('dom-addtrack');
        });
    }

    async function attachPlayerToCurrentVideo() {
        if (ui && typeof ui.destroy === 'function') {
            try {
                ui.destroy();
            } catch (error) {
                console.warn('Shaka UI destroy failed:', error);
            }
            ui = null;
        }

        await player.attach(video);

        ui = new shaka.ui.Overlay(player, videoContainer, video);
        ui.configure({
            controlPanelElements: ['play_pause', 'time_and_duration', 'spacer', 'language', 'fullscreen', 'overflow_menu']
        });

        bindVideoTextTrackEvents();
    }

    async function createFreshShakaPlayerInstance() {
        if (ui && typeof ui.destroy === 'function') {
            try {
                ui.destroy();
            } catch (error) {
                console.warn('Shaka UI destroy failed:', error);
            }
            ui = null;
        }

        if (player && typeof player.destroy === 'function') {
            try {
                await player.destroy();
            } catch (error) {
                console.warn('Shaka player destroy failed:', error);
            }
        }

        player = new shaka.Player();
        player.configure({
            streaming: {
                gapDetectionThreshold: 0.5,
                gapJumpTimerTime: 0.25
            }
        });

        player.addEventListener('error', function(event) {
            console.error('Shaka Error:', event.detail);
        });

        await attachPlayerToCurrentVideo();
    }

    async function recreateVideoElementForFreshSession() {
        if (!video || !video.parentNode) {
            return;
        }

        var newVideo = video.cloneNode(false);
        newVideo.removeAttribute('src');
        newVideo.load();
        video.parentNode.replaceChild(newVideo, video);
        video = newVideo;

        setAvPlayMode(false);
        showHtmlVideoElement();
    }

    async function initPlayer() {
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) {
            alert('Shaka Player is not supported on this device.');
            return;
        }

        await createFreshShakaPlayerInstance();

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

        stopAvPlay();
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
                lowLatencyMode: false,
                renderTextTracksNatively: true,
                enableWebVTT: true
            });

            hlsPlayer.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function(eventName, data) {
                schedulePlayerOptionsRefresh('hls-tracks-updated');
            });

            hlsPlayer.on(Hls.Events.SUBTITLE_TRACK_SWITCH, function(eventName, data) {
                syncActiveHlsSubtitleTrack('hls-switch');
                schedulePlayerOptionsRefresh('hls-switch');
            });

            hlsPlayer.on(Hls.Events.SUBTITLE_TRACK_LOADED, function(eventName, data) {
                syncActiveHlsSubtitleTrack('hls-track-loaded');
                schedulePlayerOptionsRefresh('hls-track-loaded');
            });

            hlsPlayer.on(Hls.Events.CUES_PARSED, function(eventName, data) {
                syncActiveHlsSubtitleTrack('hls-cues-parsed');
                schedulePlayerOptionsRefresh('hls-cues-parsed');
            });

            hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                if (isStaleLoad(requestId)) {
                    finish(false);
                    return;
                }
                disableAllSubtitles();
                schedulePlayerOptionsRefresh('hls-manifest-parsed');
                video.play().then(function() {
                    finish(true);
                }).catch(function(error) {
                    finish(false);
                });
            });

            hlsPlayer.on(Hls.Events.ERROR, function(eventName, data) {
                if (data && data.fatal) {
                    console.warn('Hls.js fatal error:', eventName, data);
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

    async function tryAvPlayPlayback(channelUrl, requestId, streamType) {
        if (!hasAvPlay()) {
            return false;
        }

        async function prepareForAvPlayAttempt() {
            stopAvPlay();
            destroyHlsPlayer();

            try {
                await player.unload();
            } catch (error) {
                console.warn('Shaka unload before AVPlay playback failed:', error);
            }

            resetVideoElement();
            hideHtmlVideoElement();
            setAvPlayMode(true);
        }

        async function runAvPlayAttempt(attemptIndex) {
            await prepareForAvPlayAttempt();

            return await new Promise(function(resolve) {
                var settled = false;
                var lastAvPlayError = null;

                function finish(result) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    resolve(result);
                }

                function buildFailureResult() {
                    return {
                        success: false,
                        error: lastAvPlayError
                    };
                }

                function shouldRetryForError(errorValue) {
                    return attemptIndex === 0 && errorValue === 'PLAYER_ERROR_CONNECTION_FAILED';
                }

                function failAttempt(errorValue) {
                    lastAvPlayError = errorValue || lastAvPlayError;
                    stopAvPlay();
                    if (shouldRetryForError(lastAvPlayError)) {
                        console.warn('AVPlay retrying after transient failure:', lastAvPlayError);
                    }
                    finish(buildFailureResult());
                }

                if (isStaleLoad(requestId)) {
                    stopAvPlay();
                    finish(buildFailureResult());
                    return;
                }

                try {
                    webapis.avplay.open(channelUrl);
                    avPlayState = 'IDLE';

                    try {
                        webapis.avplay.setTimeoutForBuffering(4);
                        webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 4);
                        webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 4);
                        if (streamType === 'hls') {
                            webapis.avplay.setStreamingProperty('USER_AGENT', navigator.userAgent || 'Mozilla/5.0');
                            webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=LOWEST|FIXED_MAX_RESOLUTION=3840X2160');
                        }
                    } catch (bufferingError) {
                        console.warn('AVPlay streaming config failed:', bufferingError);
                    }
                webapis.avplay.setListener({
                    onbufferingstart: function() {},
                    onbufferingprogress: function() {},
                    onbufferingcomplete: function() {},
                    oncurrentplaytime: function() {},
                    onsubtitlechange: function() {},
                    onstreamcompleted: function() {},
                    onerror: function(eventType) {
                        console.warn('AVPlay error:', eventType);
                        failAttempt(eventType);
                        }
                    });
                    updateAvPlayDisplayRect();
                    webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                    webapis.avplay.prepareAsync(function() {
                        avPlayState = 'READY';
                        try {
                            setAvPlayMode(true);
                            updateAvPlayDisplayRect();
                            webapis.avplay.play();
                            avPlayState = 'PLAYING';
                            if (isPlayerOptionsVisible && !isPlayerOptionsDropdownVisible) {
                                renderPlayerOptions();
                            }
                            finish({ success: true });
                        } catch (error) {
                            console.warn('AVPlay play failed:', error);
                            failAttempt(error && error.message);
                        }
                    }, function(error) {
                        console.warn('AVPlay prepareAsync failed:', error);
                        failAttempt(error && error.message);
                    });
                } catch (error) {
                    console.warn('AVPlay attach/load failed:', error);
                    failAttempt(error && error.message);
                }
            });
        }

        var firstAttempt = await runAvPlayAttempt(0);
        if (firstAttempt.success) {
            return true;
        }
        if (isStaleLoad(requestId)) {
            return false;
        }
        if (firstAttempt.error !== 'PLAYER_ERROR_CONNECTION_FAILED') {
            return false;
        }

        var secondAttempt = await runAvPlayAttempt(1);
        return secondAttempt.success;
    }

    async function playWithBestEngine(channelUrl, requestId) {
        var streamType = getStreamType(channelUrl);
        var manifestMimeType = getManifestMimeType(channelUrl);

        stopAvPlay();
        destroyHlsPlayer();
        resetVideoElement();

        if (isStaleLoad(requestId)) {
            throw new Error('Stale playback request');
        }

        if (streamType === 'hls') {
            var hlsHasSubtitleMetadata = await detectHlsSubtitleMetadata(channelUrl);
            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            if (hlsHasSubtitleMetadata) {
                var subtitleFirstHlsJsWorked = await tryHlsJsPlayback(channelUrl, requestId);
                if (subtitleFirstHlsJsWorked) {
                    return 'hls.js';
                }

                if (isStaleLoad(requestId)) {
                    throw new Error('Stale playback request');
                }
                console.warn('Playback fallback: Hls.js -> AVPlay', channelUrl);
            }

            var avPlayHlsWorked = await tryAvPlayPlayback(channelUrl, requestId, streamType);
            if (avPlayHlsWorked) {
                return 'avplay-hls';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            console.warn('Playback fallback: AVPlay -> Hls.js', channelUrl);
            var hlsJsWorked = await tryHlsJsPlayback(channelUrl, requestId);
            if (hlsJsWorked) {
                return 'hls.js';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            console.warn('Playback fallback: Hls.js -> Shaka', channelUrl);
            await player.load(channelUrl, null, manifestMimeType);
            return 'shaka-hls-fallback';
        }

        if (streamType === 'hls-wrapper') {
            var wrappedHlsJsWorked = await tryHlsJsPlayback(channelUrl, requestId);
            if (wrappedHlsJsWorked) {
                return 'hls.js-wrapper';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            console.warn('Playback fallback: Hls.js -> Shaka', channelUrl);
            await player.load(channelUrl, null, manifestMimeType);
            return 'shaka-hls-wrapper-fallback';
        }

        if (streamType === 'hls-stitch') {
            var stitchedHlsJsWorked = await tryHlsJsPlayback(channelUrl, requestId);
            if (stitchedHlsJsWorked) {
                return 'hls.js-stitch';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            console.warn('Playback fallback: Hls.js -> Shaka', channelUrl);
            await player.load(channelUrl, null, manifestMimeType);
            return 'shaka-hls-stitch-fallback';
        }

        if (streamType === 'mpegts') {
            var avPlayWorked = await tryAvPlayPlayback(channelUrl, requestId, streamType);
            if (avPlayWorked) {
                return 'avplay';
            }

            if (isStaleLoad(requestId)) {
                throw new Error('Stale playback request');
            }
            console.warn('Playback fallback: AVPlay -> Shaka', channelUrl);
            await player.load(channelUrl, null, manifestMimeType);
            return 'shaka-mpegts-fallback';
        }

        if (isStaleLoad(requestId)) {
            throw new Error('Stale playback request');
        }
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
        var useFreshSubtitleSession = useFreshSubtitleSessionOnNextPlaybackStart;
        if (useFreshSubtitleSession) {
            resetSubtitleTrackingState();
        } else {
            captureInitialTextTracksForLoad();
            markExistingTextTracksAsStale(requestId);
        }
        isChannelLoading = true;
        var channel = channels[index];
        disableAllSubtitles();
        var oldTracks = video.querySelectorAll('track');
        oldTracks.forEach(function(t) { t.remove(); });
        var channelUrl = channel.url;
        var streamType = getStreamType(channelUrl);
        try {
            var playbackEngine = await playWithBestEngine(channelUrl, requestId);
            if (isStaleLoad(requestId)) {
                return;
            }
            currentPlaybackEngine = playbackEngine;
            currentChannelIndex = index;
            focusedChannelIndex = index;
            useFreshSubtitleSessionOnNextPlaybackStart = false;
            isListVisible = false;
            channelList.classList.add('hidden');
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
        useFreshSubtitleSessionOnNextPlaybackStart = true;
        channelList.classList.add('hidden');
        closePlayerOptions();
        closeSearch();

        try {
            await player.unload();
        } catch (error) {
            console.warn('Player unload failed:', error);
        }

        stopAvPlay();
        destroyHlsPlayer();
        resetVideoElement();
        resetSubtitleTrackingState();
        try {
            await recreateVideoElementForFreshSession();
            await createFreshShakaPlayerInstance();
        } catch (error) {
            console.warn('Video element refresh failed:', error);
        }

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

    window.addEventListener('resize', function() {
        updateAvPlayDisplayRect();
    });

    initPlayer();
});
