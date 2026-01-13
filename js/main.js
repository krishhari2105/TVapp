document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded event fired');

    var videoPlayer = document.getElementById('videoPlayer');
    var channelList = document.getElementById('channelList');
    var listContainer = document.getElementById('listContainer');
    
    var channels = [
        { name: 'Sun TV', url: 'https://livestream10.sunnxt.com/DolbyVision/SunTV_HDR/SunTV_HDR_Endpoints/SunTV-HDR10-IN-index.m3u8' },
        { name: 'Anandham TV', url: 'https://stream.galaxyott.live/live/anandhamtv/index.m3u8' },
        { name: 'Brio TV', url: 'http://103.140.254.2:3500/live/3381.m3u8' },
        { name: 'Chithiram', url: 'https://cdn-6.pishow.tv/live/1243/master.m3u8' },
        { name: 'Colors Tamil', url: 'http://103.140.254.2:3500/live/429.m3u8' },
        { name: 'DD Tamil', url: 'https://d2lk5u59tns74c.cloudfront.net/out/v1/abf46b14847e45499f4a47f3a9afe93d/index.m3u8' },
        { name: 'Isai Aruvi', url: 'https://segment.yuppcdn.net/140622/isaiaruvi/playlist.m3u8' },
        { name: 'J Movie', url: 'http://103.140.254.2:3500/live/417.m3u8' },
        { name: 'Kalaignar Murasu', url: 'https://segment.yuppcdn.net/050522/murasu/playlist.m3u8' },
        { name: 'MN TV', url: 'https://mntv.livebox.co.in/mntvhls/live.m3u8' },
        { name: 'MNTV Music', url: 'https://mntv.livebox.co.in/musichls/live.m3u8' },
        { name: 'National Geographic Wild HD', url: 'http://103.178.78.151:7505/play/a12o/index.m3u8' },
        { name: 'Nickelodeon', url: 'http://103.178.78.151:7505/play/a0v1/index.m3u8' },
        { name: 'Peppers TV', url: 'https://cdn-2.pishow.tv/live/1383/master.m3u8' },
        { name: 'Polimer TV', url: 'https://cdn-2.pishow.tv/live/1241/master.m3u8' },
        { name: 'Raj Musix Tamil', url: 'http://103.140.254.2:3500/live/748.m3u8' },
        { name: 'Raj TV', url: 'https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/2839e3d1e0f84a2e821c1708d5fdfdf0/index.m3u8' },
        { name: 'Roja Movies ', url: 'https://stream.rojatv.cloud/rojatv/rojatv/index.m3u8' },
        { name: 'Roja TV', url: 'https://live.rojatv.cloud/rojatv/rojatv/index.m3u8' },
        { name: 'Sana Plus', url: 'https://galaxyott.live/hls/sanaplus.m3u8' },
        { name: 'Sana TV ', url: 'https://galaxyott.live/hls/sanatv.m3u8' },
        { name: 'Shalini TV', url: 'https://stream.singamcloud.in/shalinitv/shalinitv/index.m3u8' },
        { name: 'Sirippoli TV ', url: 'https://segment.yuppcdn.net/240122/siripoli/playlist.m3u8' },
        { name: 'Subin TV', url: 'https://stream.galaxyott.live/live/subintv/index.m3u8' },
        { name: 'Suriyan TV', url: 'https://stream.galaxyott.live/live/suriyantv/index.m3u8' },
        { name: 'Thalaa TV', url: 'https://streams2.sofast.tv/ptnr-yupptv/title-THALAA-TV-TAM_yupptv/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/2069c593-3c07-4d62-9d44-746be5c3a5d6/manifest.m3u8' },
        { name: 'Thendral TV', url: 'https://live.thendralcloud.in/thendraltv/d0dbe915091d400bd8ee7f27f0791303.sdp/chunks.m3u8' },
        { name: 'Tunes 6', url: 'http://103.140.254.2:3500/live/803.m3u8' },
        { name: 'Ultimate TV', url: 'https://stream.galaxyott.live/live/utv/index.m3u8' }
    ];

    var currentChannelIndex = 0;
    var focusedChannelIndex = 0;
    var isListVisible = false;

    // Populate the list UI
    channels.forEach(function(channel, index) {
        var li = document.createElement('li');
        li.textContent = channel.name;
        li.classList.add('channel-item');
        li.id = 'channel-' + index;
        listContainer.appendChild(li);
    });

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

    function loadChannel(index) {
        console.log('Loading channel:', channels[index].name);
        if (Hls.isSupported()) {
            var hls = new Hls();
            hls.loadSource(channels[index].url);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                videoPlayer.play();
            });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            videoPlayer.src = channels[index].url;
            videoPlayer.play();
        }

        currentChannelIndex = index;
        isListVisible = false;
        channelList.classList.add('hidden');
        showChannelBanner(channels[index].name); // This will now work
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
            banner.style.fontSize = '30px';
            banner.style.fontFamily = 'sans-serif';
            banner.style.display = 'flex';
            banner.style.alignItems = 'center';
            banner.style.paddingLeft = '50px';
            banner.style.zIndex = '1000';
            document.body.appendChild(banner);
        }
        banner.innerHTML = `<span>${channelName}</span>`;
        banner.style.display = 'flex';
        
        setTimeout(function() {
            banner.style.display = 'none';
        }, 5000);
    }

    document.addEventListener('keydown', function(event) {
        var keyCode = event.keyCode;
        switch (event.key) {
            case 'Enter':
            case 'Select': // Remote OK/Center button
                if (!isListVisible) {
                    toggleChannelList();
                } else {
                    loadChannel(focusedChannelIndex);
                }
                break;
            case 'ArrowUp':
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex - 1 + channels.length) % channels.length;
                    updateListFocus();
                } else {
                    loadChannel((currentChannelIndex + 1) % channels.length);
                }
                break;
            case 'ArrowDown':
                if (isListVisible) {
                    focusedChannelIndex = (focusedChannelIndex + 1) % channels.length;
                    updateListFocus();
                } else {
                    loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
                }
                break;
            case 'Back':
            case 'XF86Back':
                if (isListVisible) {
                    toggleChannelList();
                } else if (confirm('Exit TVapp?')) {
                    tizen.application.getCurrentApplication().exit();
                }
                break;
        }
        
        // Handling specific CH UP/DOWN buttons
        if (keyCode === 427) loadChannel((currentChannelIndex + 1) % channels.length);
        if (keyCode === 428) loadChannel((currentChannelIndex - 1 + channels.length) % channels.length);
    });

    loadChannel(currentChannelIndex); // Initial load
});