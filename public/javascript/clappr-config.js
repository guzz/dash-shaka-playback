const playerElement = document.getElementById('player-wrapper')
Clappr.Log.setLevel(Clappr.Log.LEVEL_INFO);

const player = new Clappr.Player({
  source: '//storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd', //
  // source: 'http://clips.vorwaerts-gmbh.de/big_buck_bunny.mp4',
  // source: 'http://clappr.io/highline.mp4',
  //source: 'http://www.streambox.fr/playlists/x36xhzz/x36xhzz.m3u8',
  poster: 'http://clappr.io/poster.png',
  plugins: [
    window.DashShakaPlayback,
    window.LevelSelector
  ],
})

player.attachTo(playerElement)
