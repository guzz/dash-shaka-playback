import _classCallCheck from '@babel/runtime/helpers/classCallCheck';
import _createClass from '@babel/runtime/helpers/createClass';
import _get from '@babel/runtime/helpers/get';
import _inherits from '@babel/runtime/helpers/inherits';
import _possibleConstructorReturn from '@babel/runtime/helpers/possibleConstructorReturn';
import _getPrototypeOf from '@babel/runtime/helpers/getPrototypeOf';
import { Events, Log, PlayerError, HTML5Video } from '@guzzj/clappr-core';
import shaka from 'shaka-player';

function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }

function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
var SEND_STATS_INTERVAL_MS = 30 * 1e3;
var DEFAULT_LEVEL_AUTO = -1;

var DashShakaPlayback = /*#__PURE__*/function (_HTML5Video) {
  _inherits(DashShakaPlayback, _HTML5Video);

  var _super = _createSuper(DashShakaPlayback);

  function DashShakaPlayback() {
    var _this;

    _classCallCheck(this, DashShakaPlayback);

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    _this = _super.call.apply(_super, [this].concat(args));
    _this._levels = [];
    _this._pendingAdaptationEvent = false;
    _this._isShakaReadyState = false;
    _this._minDvrSize = typeof _this.options.shakaMinimumDvrSize === 'undefined' ? 60 : _this.options.shakaMinimumDvrSize;
    return _this;
  }

  _createClass(DashShakaPlayback, [{
    key: "name",
    get: function get() {
      return 'dash_shaka_playback';
    }
  }, {
    key: "shakaVersion",
    get: function get() {
      return shaka.player.Player.version;
    }
  }, {
    key: "shakaPlayerInstance",
    get: function get() {
      return this._player;
    }
  }, {
    key: "levels",
    get: function get() {
      return this._levels;
    }
  }, {
    key: "seekRange",
    get: function get() {
      if (!this.shakaPlayerInstance) return {
        start: 0,
        end: 0
      };
      return this.shakaPlayerInstance.seekRange();
    }
  }, {
    key: "currentLevel",
    get: function get() {
      return this._currentLevelId || DEFAULT_LEVEL_AUTO;
    },
    set: function set(id) {
      var _this2 = this;

      this._currentLevelId = id;
      var isAuto = this._currentLevelId === DEFAULT_LEVEL_AUTO;
      this.trigger(Events.PLAYBACK_LEVEL_SWITCH_START);

      if (!isAuto) {
        this._player.configure({
          abr: {
            enabled: false
          }
        });

        this._pendingAdaptationEvent = true;
        this.selectTrack(this.videoTracks.filter(function (t) {
          return t.id === _this2._currentLevelId;
        })[0]);
      } else {
        this._player.configure({
          abr: {
            enabled: true
          }
        });

        this.trigger(Events.PLAYBACK_LEVEL_SWITCH_END);
      }
    }
  }, {
    key: "dvrEnabled",
    get: function get() {
      return this._duration >= this._minDvrSize && this.getPlaybackType() === 'live';
    }
  }, {
    key: "getDuration",
    value: function getDuration() {
      return this._duration;
    }
  }, {
    key: "_duration",
    get: function get() {
      if (!this.shakaPlayerInstance) return 0;
      return this.seekRange.end - this.seekRange.start;
    }
  }, {
    key: "getCurrentTime",
    value: function getCurrentTime() {
      if (!this.shakaPlayerInstance) return 0;
      return this.shakaPlayerInstance.getMediaElement().currentTime - this.seekRange.start;
    }
  }, {
    key: "_startTime",
    get: function get() {
      return this.seekRange.start;
    }
  }, {
    key: "presentationTimeline",
    get: function get() {
      if (!this.shakaPlayerInstance || !this.shakaPlayerInstance.getManifest()) return null;
      return this.shakaPlayerInstance.getManifest().presentationTimeline;
    }
  }, {
    key: "bandwidthEstimate",
    get: function get() {
      if (!this.shakaPlayerInstance) return null;
      return this.shakaPlayerInstance.getStats().estimatedBandwidth;
    }
  }, {
    key: "getProgramDateTime",
    value: function getProgramDateTime() {
      if (!this.shakaPlayerInstance || !this.presentationTimeline) return 0;
      return new Date((this.presentationTimeline.getPresentationStartTime() + this.seekRange.start) * 1000);
    }
  }, {
    key: "_updateDvr",
    value: function _updateDvr(status) {
      this.trigger(Events.PLAYBACK_DVR, status);
      this.trigger(Events.PLAYBACK_STATS_ADD, {
        'dvr': status
      });
    }
  }, {
    key: "seek",
    value: function seek(time) {
      if (time < 0) {
        Log.warn('Attempt to seek to a negative time. Resetting to live point. Use seekToLivePoint() to seek to the live point.');
        time = this._duration;
      } // assume live if time within 3 seconds of end of stream


      this.dvrEnabled && this._updateDvr(time < this._duration - 3);
      time += this._startTime;
      this.el.currentTime = time;
    }
  }, {
    key: "pause",
    value: function pause() {
      this.el.pause();
      this.dvrEnabled && this._updateDvr(true);
    }
  }, {
    key: "play",
    value: function play() {
      if (!this._player) {
        this._setup();
      }

      if (!this.isReady) {
        this.once(DashShakaPlayback.Events.SHAKA_READY, this.play);
        return;
      }

      this._stopped = false;
      this._src = this.el.src;

      _get(_getPrototypeOf(DashShakaPlayback.prototype), "play", this).call(this);

      this._startTimeUpdateTimer();
    }
  }, {
    key: "_onPlaying",
    value: function _onPlaying() {
      /*
        The `_onPlaying` should not be called while buffering: https://github.com/google/shaka-player/issues/2230
        It will be executed on bufferfull.
      */
      if (this._isBuffering) return;
      return _get(_getPrototypeOf(DashShakaPlayback.prototype), "_onPlaying", this).call(this);
    }
  }, {
    key: "_onSeeking",
    value: function _onSeeking() {
      this._isSeeking = true;
      return _get(_getPrototypeOf(DashShakaPlayback.prototype), "_onSeeking", this).call(this);
    }
  }, {
    key: "_onSeeked",
    value: function _onSeeked() {
      /*
        The `_onSeeked` should not be called while buffering.
        It will be executed on bufferfull.
      */
      if (this._isBuffering) return;
      this._isSeeking = false;
      return _get(_getPrototypeOf(DashShakaPlayback.prototype), "_onSeeked", this).call(this);
    }
  }, {
    key: "_startTimeUpdateTimer",
    value: function _startTimeUpdateTimer() {
      var _this3 = this;

      this._stopTimeUpdateTimer();

      this._timeUpdateTimer = setInterval(function () {
        _this3._onTimeUpdate();
      }, 100);
    }
  }, {
    key: "_stopTimeUpdateTimer",
    value: function _stopTimeUpdateTimer() {
      this._timeUpdateTimer && clearInterval(this._timeUpdateTimer);
    } // skipping HTML5Video `_setupSrc` (on tag video)

  }, {
    key: "_setupSrc",
    value: function _setupSrc() {} // skipping ready event on video tag in favor of ready on shaka

  }, {
    key: "_ready",
    value: function _ready() {// override with no-op
    }
  }, {
    key: "_onShakaReady",
    value: function _onShakaReady() {
      this._isShakaReadyState = true;
      this.trigger(DashShakaPlayback.Events.SHAKA_READY);
      this.trigger(Events.PLAYBACK_READY, this.name);
    }
  }, {
    key: "isReady",
    get: function get() {
      return this._isShakaReadyState;
    } // skipping error handling on video tag in favor of error on shaka

  }, {
    key: "error",
    value: function error(event) {
      Log.error('an error was raised by the video tag', event, this.el.error);
    }
  }, {
    key: "isHighDefinitionInUse",
    value: function isHighDefinitionInUse() {
      return !!this.highDefinition;
    }
  }, {
    key: "stop",
    value: function stop() {
      var _this4 = this;

      this._stopTimeUpdateTimer();

      clearInterval(this.sendStatsId);
      this._stopped = true;

      if (this._player) {
        this._sendStats();

        this._player.unload().then(function () {
          _get(_getPrototypeOf(DashShakaPlayback.prototype), "stop", _this4).call(_this4);

          _this4._player = null;
          _this4._isShakaReadyState = false;
        })["catch"](function () {
          Log.error('shaka could not be unloaded');
        });
      } else {
        _get(_getPrototypeOf(DashShakaPlayback.prototype), "stop", this).call(this);
      }
    }
  }, {
    key: "textTracks",
    get: function get() {
      return this.isReady && this._player.getTextTracks();
    }
  }, {
    key: "audioTracks",
    get: function get() {
      return this.isReady && this._player.getVariantTracks().filter(function (t) {
        return t.mimeType.startsWith('audio/');
      });
    }
  }, {
    key: "videoTracks",
    get: function get() {
      return this.isReady && this._player.getVariantTracks().filter(function (t) {
        return t.mimeType.startsWith('video/');
      });
    }
  }, {
    key: "getPlaybackType",
    value: function getPlaybackType() {
      return (this.isReady && this._player.isLive() ? 'live' : 'vod') || '';
    }
  }, {
    key: "selectTrack",
    value: function selectTrack(track) {
      if (track.type === 'text') {
        this._player.selectTextTrack(track);
      } else if (track.type === 'variant') {
        this._player.selectVariantTrack(track);

        if (track.mimeType.startsWith('video/')) {
          // we trigger the adaptation event here
          // because Shaka doesn't trigger its event on "manual" selection.
          this._onAdaptation();
        }
      } else {
        throw new Error('Unhandled track type:', track.type);
      }
    }
    /**
     * @override
     */

  }, {
    key: "closedCaptionsTracks",
    get: function get() {
      var id = 0;

      var trackId = function trackId() {
        return id++;
      };

      var tracks = this.textTracks || [];
      return tracks.filter(function (track) {
        return track.kind === 'subtitle';
      }).map(function (track) {
        return {
          id: trackId(),
          name: track.label || track.language,
          track: track
        };
      });
    }
    /**
     * @override
     */

  }, {
    key: "closedCaptionsTrackId",
    get: function get() {
      return _get(_getPrototypeOf(DashShakaPlayback.prototype), "closedCaptionsTrackId", this);
    }
    /**
     * @override
     */
    ,
    set: function set(trackId) {
      if (!this._player) {
        return;
      }

      var tracks = this.closedCaptionsTracks;
      var showingTrack; // Note: -1 is for hide all tracks

      if (trackId !== -1) {
        showingTrack = tracks.find(function (track) {
          return track.id === trackId;
        });

        if (!showingTrack) {
          Log.warn("Track id \"".concat(trackId, "\" not found"));
          return;
        }

        if (this._shakaTTVisible && showingTrack.track.active === true) {
          Log.info("Track id \"".concat(trackId, "\" already showing"));
          return;
        }
      }

      if (showingTrack) {
        this._player.selectTextTrack(showingTrack.track);

        this._player.setTextTrackVisibility(true);

        this._enableShakaTextTrack(true);
      } else {
        this._player.setTextTrackVisibility(false);

        this._enableShakaTextTrack(false);
      }

      this._ccTrackId = trackId;
      this.trigger(Events.PLAYBACK_SUBTITLE_CHANGED, {
        id: trackId
      });
    }
  }, {
    key: "_enableShakaTextTrack",
    value: function _enableShakaTextTrack(isEnable) {
      // Shaka player use only one TextTrack object with video element to handle all text tracks
      // It must be enabled or disabled in addition to call selectTextTrack()
      if (!this.el.textTracks) {
        return;
      }

      this._shakaTTVisible = isEnable;
      Array.from(this.el.textTracks).filter(function (track) {
        return track.kind === 'subtitles';
      }).forEach(function (track) {
        return track.mode = isEnable === true ? 'showing' : 'hidden';
      });
    }
  }, {
    key: "_checkForClosedCaptions",
    value: function _checkForClosedCaptions() {
      if (this._ccIsSetup) {
        return;
      }

      if (this.hasClosedCaptionsTracks) {
        this.trigger(Events.PLAYBACK_SUBTITLE_AVAILABLE);
        var trackId = this.closedCaptionsTrackId;
        this.closedCaptionsTrackId = trackId;
      }

      this._ccIsSetup = true;
    }
  }, {
    key: "destroy",
    value: function destroy() {
      var _this5 = this;

      this._stopTimeUpdateTimer();

      clearInterval(this.sendStatsId);

      if (this._player) {
        this._player.destroy().then(function () {
          return _this5._destroy();
        })["catch"](function () {
          _this5._destroy();

          Log.error('shaka could not be destroyed');
        });
      } else {
        this._destroy();
      }

      _get(_getPrototypeOf(DashShakaPlayback.prototype), "destroy", this).call(this);
    }
  }, {
    key: "_setup",
    value: function _setup() {
      var _this6 = this;

      this._isShakaReadyState = false;
      this._ccIsSetup = false;

      var runAllSteps = function runAllSteps() {
        _this6._player = _this6._createPlayer();

        _this6._setInitialConfig();

        _this6._loadSource();
      };

      this._player ? this._player.destroy().then(function () {
        return runAllSteps();
      }) : runAllSteps();
    }
  }, {
    key: "_createPlayer",
    value: function _createPlayer() {
      var player = new shaka.Player(this.el);
      player.addEventListener('error', this._onError.bind(this));
      player.addEventListener('adaptation', this._onAdaptation.bind(this));
      player.addEventListener('buffering', this._handleShakaBufferingEvents.bind(this));
      return player;
    }
  }, {
    key: "_setInitialConfig",
    value: function _setInitialConfig() {
      this._options.shakaConfiguration && this._player.configure(this._options.shakaConfiguration);
      this._options.shakaOnBeforeLoad && this._options.shakaOnBeforeLoad(this._player);
    }
  }, {
    key: "_loadSource",
    value: function _loadSource() {
      var _this7 = this;

      this._player.load(this._options.src).then(function () {
        return _this7._loaded();
      })["catch"](function (e) {
        return _this7._setupError(e);
      });
    }
  }, {
    key: "_onTimeUpdate",
    value: function _onTimeUpdate() {
      if (!this.shakaPlayerInstance) return;
      var update = {
        current: this.getCurrentTime(),
        total: this.getDuration(),
        firstFragDateTime: this.getProgramDateTime()
      };
      var isSame = this._lastTimeUpdate && update.current === this._lastTimeUpdate.current && update.total === this._lastTimeUpdate.total;
      if (isSame) return;
      this._lastTimeUpdate = update;
      this.trigger(Events.PLAYBACK_TIMEUPDATE, update, this.name);
    } // skipping HTML5 `_handleBufferingEvents` in favor of shaka buffering events

  }, {
    key: "_handleBufferingEvents",
    value: function _handleBufferingEvents() {}
  }, {
    key: "_handleShakaBufferingEvents",
    value: function _handleShakaBufferingEvents(e) {
      if (this._stopped) return;
      this._isBuffering = e.buffering;
      this._isBuffering ? this._onBuffering() : this._onBufferfull();
    }
  }, {
    key: "_onBuffering",
    value: function _onBuffering() {
      this.trigger(Events.PLAYBACK_BUFFERING);
    }
  }, {
    key: "_onBufferfull",
    value: function _onBufferfull() {
      this.trigger(Events.PLAYBACK_BUFFERFULL);
      if (this._isSeeking) this._onSeeked();
      if (this.isPlaying()) this._onPlaying();
    }
  }, {
    key: "_loaded",
    value: function _loaded() {
      this._onShakaReady();

      this._startToSendStats();

      this._fillLevels();

      this._checkForClosedCaptions();
    }
  }, {
    key: "_fillLevels",
    value: function _fillLevels() {
      if (this._levels.length === 0) {
        this._levels = this.videoTracks.map(function (videoTrack) {
          return {
            id: videoTrack.id,
            label: "".concat(videoTrack.height, "p")
          };
        }).reverse();
        this.trigger(Events.PLAYBACK_LEVELS_AVAILABLE, this.levels);
      }
    }
  }, {
    key: "_startToSendStats",
    value: function _startToSendStats() {
      var _this8 = this;

      var intervalMs = this._options.shakaSendStatsInterval || SEND_STATS_INTERVAL_MS;
      this.sendStatsId = setInterval(function () {
        return _this8._sendStats();
      }, intervalMs);
    }
  }, {
    key: "_sendStats",
    value: function _sendStats() {
      this.trigger(Events.PLAYBACK_STATS_ADD, this._player.getStats());
    }
  }, {
    key: "_setupError",
    value: function _setupError(err) {
      this._onError(err);
    }
  }, {
    key: "_onError",
    value: function _onError(err) {
      var error = {
        shakaError: err,
        videoError: this.el.error
      };

      var _ref = error.shakaError.detail || error.shakaError,
          category = _ref.category,
          code = _ref.code,
          severity = _ref.severity;

      if (error.videoError || !code && !category) return _get(_getPrototypeOf(DashShakaPlayback.prototype), "_onError", this).call(this);
      var isCritical = severity === shaka.util.Error.Severity.CRITICAL;
      var errorData = {
        code: "".concat(category, "_").concat(code),
        description: "Category: ".concat(category, ", code: ").concat(code, ", severity: ").concat(severity),
        level: isCritical ? PlayerError.Levels.FATAL : PlayerError.Levels.WARN,
        raw: err
      };
      var formattedError = this.createError(errorData);
      Log.error('Shaka error event:', formattedError);
      this.trigger(Events.PLAYBACK_ERROR, formattedError);
    }
  }, {
    key: "_onAdaptation",
    value: function _onAdaptation() {
      var activeVideo = this.videoTracks.filter(function (t) {
        return t.active === true;
      })[0];

      this._fillLevels(); // update stats that may have changed before we trigger event
      // so that user can rely on stats data when handling event


      this._sendStats();

      if (this._pendingAdaptationEvent) {
        this.trigger(Events.PLAYBACK_LEVEL_SWITCH_END);
        this._pendingAdaptationEvent = false;
      }

      Log.debug('an adaptation has happened:', activeVideo);
      this.highDefinition = activeVideo.height >= 720;
      this.trigger(Events.PLAYBACK_HIGHDEFINITIONUPDATE, this.highDefinition);
      this.trigger(Events.PLAYBACK_BITRATE, {
        bandwidth: activeVideo.bandwidth,
        width: activeVideo.width,
        height: activeVideo.height,
        level: activeVideo.id,
        bitrate: activeVideo.videoBandwidth
      });
    }
  }, {
    key: "_updateSettings",
    value: function _updateSettings() {
      if (this.getPlaybackType() === 'vod') this.settings.left = ['playpause', 'position', 'duration'];else if (this.dvrEnabled) this.settings.left = ['playpause'];else this.settings.left = ['playstop'];
      this.settings.seekEnabled = this.isSeekEnabled();
      this.trigger(Events.PLAYBACK_SETTINGSUPDATE);
    }
  }, {
    key: "_destroy",
    value: function _destroy() {
      this._isShakaReadyState = false;
      Log.debug('shaka was destroyed');
    }
  }], [{
    key: "Events",
    get: function get() {
      return {
        SHAKA_READY: 'shaka:ready'
      };
    }
  }, {
    key: "shakaPlayer",
    get: function get() {
      return shaka;
    }
  }, {
    key: "canPlay",
    value: function canPlay(resource) {
      var mimeType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      shaka.polyfill.installAll();
      var browserSupported = shaka.Player.isBrowserSupported();
      var resourceParts = resource.split('?')[0].match(/.*\.(.*)$/) || [];
      return browserSupported && (resourceParts[1] === 'mpd' || mimeType.indexOf('application/dash+xml') > -1);
    }
  }]);

  return DashShakaPlayback;
}(HTML5Video);

export default DashShakaPlayback;
