/*
 * NavSri — Tour.js
 * Full architecture: Explore Mode | Navigate Mode | QR Scan | BFS Pathfinding | Hotspot Glow
 */
'use strict';

(function () {
  var Marzipano = window.Marzipano;
  var bowser    = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // ── URL Mode param ──────────────────────────────────────
  var urlParams = new URLSearchParams(window.location.search);
  var urlMode   = urlParams.get('mode') || 'explore'; // 'explore' | 'navigate' | 'qr'
  var urlStart  = urlParams.get('start') || null;     // scene id pre-set via QR

  // ── DOM References ──────────────────────────────────────
  var panoElement            = document.querySelector('#pano');
  var sceneNameElement       = document.querySelector('#titleBar .sceneName');
  var sceneListElement       = document.querySelector('#sceneList');
  var sceneElements          = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement= document.querySelector('#autorotateToggle');
  var fullscreenToggleElement= document.querySelector('#fullscreenToggle');

  // Top bar
  var modeChipIcon   = document.getElementById('modeChipIcon');
  var modeChipLabel  = document.getElementById('modeChipLabel');
  var modeChip       = document.getElementById('modeChip');
  var switchModeBtn  = document.getElementById('switchModeBtn');

  // Nav panel (From/To)
  var navPanel      = document.getElementById('navPanel');
  var fromInput     = document.getElementById('fromInput');
  var toInput       = document.getElementById('toInput');
  var fromSuggs     = document.getElementById('fromSuggestions');
  var toSuggs       = document.getElementById('toSuggestions');
  var clearFrom     = document.getElementById('clearFrom');
  var clearTo       = document.getElementById('clearTo');
  var swapBtn       = document.getElementById('swapFromTo');
  var qrScanFromBtn = document.getElementById('qrScanFromBtn');
  var getRouteBtn   = document.getElementById('getRouteBtn');

  // Route summary
  var routeSummary      = document.getElementById('routeSummary');
  var routeFromLabel    = document.getElementById('routeFromLabel');
  var routeToLabel      = document.getElementById('routeToLabel');
  var routeStepCount    = document.getElementById('routeStepCount');
  var routeStepsList    = document.getElementById('routeStepsList');
  var startTourBtn      = document.getElementById('startTourBtn');
  var closeRouteSummary = document.getElementById('closeRouteSummary');

  // Nav Status
  var navStatus    = document.getElementById('navStatus');
  var navDestName  = document.getElementById('navDestName');
  var navStatusStep= document.getElementById('navStatusStep');
  var navCancelBtn = document.getElementById('navCancelBtn');
  var navStepDots  = document.getElementById('navStepDots');
  var navStepLabel = document.getElementById('navStepLabel');

  // Explore search
  var explorePanel   = document.getElementById('exploreSearchPanel');
  var navSearchInput = document.getElementById('navSearchInput');
  var navSuggestions = document.getElementById('navSuggestions');
  var navClearBtn    = document.getElementById('navClearBtn');

  // QR Modal
  var qrModal        = document.getElementById('qrModal');
  var qrModalClose   = document.getElementById('qrModalClose');
  var qrVideo        = document.getElementById('qrVideo');
  var qrCanvas       = document.getElementById('qrCanvas');
  var qrResult       = document.getElementById('qrResult');
  var qrResultText   = document.getElementById('qrResultText');
  var qrError        = document.getElementById('qrError');
  var qrManualSelect = document.getElementById('qrManualSelect');
  var qrManualConfirm= document.getElementById('qrManualConfirm');

  // ── Mode state ──────────────────────────────────────────
  // 'explore' or 'navigate'
  var appMode = 'explore';

  // ── Navigation state ────────────────────────────────────
  var navState = {
    active: false,
    path: [],
    destId: null,
    fromId: null,
    currentStepIndex: 0,
    hotspotElements: {}
  };

  // ── Scene icon map ──────────────────────────────────────
  var sceneIcons = {
    'entrance':'🚪','gate':'🚪','garden':'🌿','temple':'🛕',
    'nursing':'🏥','engineering':'🏗️','stage':'🎭','office':'🏢',
    'principal':'👨‍💼','floor':'🏢','lab':'🔬','physics':'⚛️',
    'cse':'💻','ethno':'🏛️','nexus':'🌐','aids':'💡',
    'wrkube':'🧊','csbs':'📐','auditorium':'🎪'
  };

  function getSceneIcon(name) {
    var l = name.toLowerCase();
    for (var k in sceneIcons) { if (l.indexOf(k) !== -1) return sceneIcons[k]; }
    return '📍';
  }

  // ── Detect device ───────────────────────────────────────
  if (window.matchMedia) {
    var setMode = function () {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia('(max-width: 500px), (max-height: 500px)');
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function () {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // ── Viewer ──────────────────────────────────────────────
  var viewer = new Marzipano.Viewer(panoElement, {
    controls: { mouseViewMode: data.settings.mouseViewMode }
  });

  // ── Build scene graph ───────────────────────────────────
  var sceneGraph = {};
  data.scenes.forEach(function (sd) {
    sceneGraph[sd.id] = sd.linkHotspots.map(function (hs) {
      return { targetId: hs.target };
    });
  });

  // ── BFS ─────────────────────────────────────────────────
  function findPath(startId, destId) {
    if (startId === destId) return [startId];
    var visited = {}, queue = [[startId]];
    visited[startId] = true;
    while (queue.length) {
      var path = queue.shift();
      var cur  = path[path.length - 1];
      (sceneGraph[cur] || []).forEach(function (n) {
        if (visited[n.targetId]) return;
        var np = path.concat([n.targetId]);
        if (n.targetId === destId) { queue = [np]; return; } // abuse: trick to break
        visited[n.targetId] = true;
        queue.push(np);
      });
      // check if last item is dest
      var last = queue[queue.length - 1];
      if (last && last[last.length - 1] === destId) return last;
    }
    return null;
  }

  // Better BFS — non-tricky
  function bfs(startId, destId) {
    if (startId === destId) return [startId];
    var visited = {};
    var queue = [[startId]];
    visited[startId] = true;
    while (queue.length) {
      var path = queue.shift();
      var cur = path[path.length - 1];
      var neighbors = sceneGraph[cur] || [];
      for (var i = 0; i < neighbors.length; i++) {
        var nid = neighbors[i].targetId;
        if (visited[nid]) continue;
        var newPath = path.concat([nid]);
        if (nid === destId) return newPath;
        visited[nid] = true;
        queue.push(newPath);
      }
    }
    return null;
  }

  // ── Create Scenes ────────────────────────────────────────
  var scenes = data.scenes.map(function (sd) {
    var source = Marzipano.ImageUrlSource.fromString(
      'tiles/' + sd.id + '/{z}/{f}/{y}/{x}.jpg',
      { cubeMapPreviewUrl: 'tiles/' + sd.id + '/preview.jpg' }
    );
    var geometry = new Marzipano.CubeGeometry(sd.levels);
    var limiter = Marzipano.RectilinearView.limit.traditional(sd.faceSize, 100 * Math.PI / 180, 120 * Math.PI / 180);
    var view    = new Marzipano.RectilinearView(sd.initialViewParameters, limiter);
    var scene   = viewer.createScene({ source, geometry, view, pinFirstLevel: true });

    // Link hotspots
    var linkEls = [];
    sd.linkHotspots.forEach(function (hs, idx) {
      var el = createLinkHotspotElement(hs);
      el.setAttribute('data-hotspot-target', hs.target);
      el.setAttribute('data-scene-id', sd.id);
      el.setAttribute('data-hotspot-index', idx);
      scene.hotspotContainer().createHotspot(el, { yaw: hs.yaw, pitch: hs.pitch });
      linkEls.push(el);
    });
    navState.hotspotElements[sd.id] = linkEls;

    // Info hotspots
    sd.infoHotspots.forEach(function (hs) {
      scene.hotspotContainer().createHotspot(createInfoHotspotElement(hs), { yaw: hs.yaw, pitch: hs.pitch });
    });

    return { data: sd, scene, view };
  });

  // ── Autorotate ───────────────────────────────────────────
  var autorotate = Marzipano.autorotate({ yawSpeed: 0.03, targetPitch: 0, targetFov: Math.PI / 2 });
  if (data.settings.autorotateEnabled) autorotateToggleElement.classList.add('enabled');
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // ── Fullscreen ───────────────────────────────────────────
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function () { screenfull.toggle(); });
    screenfull.on('change', function () {
      fullscreenToggleElement.classList.toggle('enabled', screenfull.isFullscreen);
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // ── Scene List ───────────────────────────────────────────
  sceneListToggleElement.addEventListener('click', toggleSceneList);
  if (!document.body.classList.contains('mobile')) showSceneList();

  scenes.forEach(function (scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    if (!el) return;
    el.addEventListener('click', function () {
      switchScene(scene);
      if (document.body.classList.contains('mobile')) hideSceneList();
    });
  });

  // ── View Controls ────────────────────────────────────────
  var velocity = 0.7, friction = 3;
  var controls = viewer.controls();
  var ctrl = function (id, axis, v) { return new Marzipano.ElementPressControlMethod(document.querySelector(id), axis, v, friction); };
  controls.registerMethod('upElement',    ctrl('#viewUp',    'y', -velocity), true);
  controls.registerMethod('downElement',  ctrl('#viewDown',  'y',  velocity), true);
  controls.registerMethod('leftElement',  ctrl('#viewLeft',  'x', -velocity), true);
  controls.registerMethod('rightElement', ctrl('#viewRight', 'x',  velocity), true);
  controls.registerMethod('inElement',    ctrl('#viewIn',  'zoom', -velocity), true);
  controls.registerMethod('outElement',   ctrl('#viewOut', 'zoom',  velocity), true);

  // ── Helpers ──────────────────────────────────────────────
  function sanitize(s) { return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'); }

  function findSceneById(id) {
    return scenes.find(function (s) { return s.data.id === id; }) || null;
  }

  function findSceneDataById(id) {
    return data.scenes.find(function (s) { return s.id === id; }) || null;
  }

  var currentScene = null;

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    sceneNameElement.innerHTML = sanitize(scene.data.name);
    updateSceneList(scene);
    currentScene = scene;

    // Sync "From" field in navigate mode
    if (appMode === 'navigate' && !navState.active) {
      fromInput.value = scene.data.name.trim();
      fromSceneId = scene.data.id;
      clearFrom.classList.add('visible');
      validateRouteBtn();
    }

    if (navState.active) onSceneChangedDuringNav(scene.data.id);
  }

  function updateSceneList(scene) {
    sceneElements.forEach(function (el) {
      el.classList.toggle('current', el.getAttribute('data-id') === scene.data.id);
    });
  }

  function showSceneList()   { sceneListElement.classList.add('enabled');    sceneListToggleElement.classList.add('enabled'); }
  function hideSceneList()   { sceneListElement.classList.remove('enabled'); sceneListToggleElement.classList.remove('enabled'); }
  function toggleSceneList() { sceneListElement.classList.toggle('enabled'); sceneListToggleElement.classList.toggle('enabled'); }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) return;
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }
  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }
  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  // ── Hotspot Elements ─────────────────────────────────────
  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'link-hotspot');

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');
    ['-ms-transform', '-webkit-transform', 'transform'].forEach(function (p) {
      icon.style[p] = 'rotate(' + hotspot.rotation + 'rad)';
    });

    wrapper.addEventListener('click', function () { switchScene(findSceneById(hotspot.target)); });
    stopTouchAndScrollEventPropagation(wrapper);

    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip', 'link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);
    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'info-hotspot');

    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function () { wrapper.classList.toggle('visible'); modal.classList.toggle('visible'); };
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);
    stopTouchAndScrollEventPropagation(wrapper);
    return wrapper;
  }

  function stopTouchAndScrollEventPropagation(el) {
    ['touchstart','touchmove','touchend','touchcancel','wheel','mousewheel'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
  }

  // ── Initial Scene ─────────────────────────────────────────
  var startScene = scenes[0];
  if (urlStart) {
    var s = findSceneById(urlStart);
    if (s) startScene = s;
  }
  switchScene(startScene);

  // ── Populate QR manual select ─────────────────────────────
  data.scenes.forEach(function (sd) {
    var opt = document.createElement('option');
    opt.value = sd.id;
    opt.textContent = sd.name.trim();
    qrManualSelect.appendChild(opt);
  });

  // ==========================================================
  // APP MODE SYSTEM
  // ==========================================================
  function setAppMode(mode) {
    appMode = mode;
    if (mode === 'navigate') {
      document.body.classList.add('navigate-mode');
      modeChip.classList.remove('explore');
      modeChip.classList.add('navigate');
      modeChipIcon.textContent = '🗺️';
      modeChipLabel.textContent = 'Navigate Mode';
      switchModeBtn.textContent = '⇄ Explore';
      navPanel.classList.remove('hidden');
      explorePanel.classList.add('hidden');
      routeSummary.classList.add('hidden');
      // Pre-fill From with current scene
      if (currentScene) {
        fromInput.value = currentScene.data.name.trim();
        fromSceneId = currentScene.data.id;
        clearFrom.classList.add('visible');
      }
      validateRouteBtn();
    } else {
      document.body.classList.remove('navigate-mode');
      modeChip.classList.remove('navigate');
      modeChip.classList.add('explore');
      modeChipIcon.textContent = '🌐';
      modeChipLabel.textContent = 'Explore Mode';
      switchModeBtn.textContent = '⇄ Navigate';
      navPanel.classList.add('hidden');
      routeSummary.classList.add('hidden');
      explorePanel.classList.remove('hidden');
      cancelNavigation();
    }
  }

  switchModeBtn.addEventListener('click', function () {
    setAppMode(appMode === 'navigate' ? 'explore' : 'navigate');
  });

  // Initial mode from URL
  if (urlMode === 'navigate' || urlMode === 'qr') {
    setAppMode('navigate');
    if (urlMode === 'qr') openQRModal('from');
  } else {
    setAppMode('explore');
  }

  // ==========================================================
  // NAVIGATE MODE — FROM / TO FIELDS
  // ==========================================================
  var fromSceneId = null;
  var toSceneId   = null;

  function validateRouteBtn() {
    getRouteBtn.disabled = !(fromSceneId && toSceneId && fromSceneId !== toSceneId);
  }

  // ── From field ──
  fromInput.addEventListener('input', function () {
    fromSceneId = null;
    clearFrom.classList.toggle('visible', fromInput.value.trim().length > 0);
    validateRouteBtn();
    renderFieldSuggestions(fromInput.value.trim(), fromSuggs, function (id, name) {
      fromSceneId = id;
      fromInput.value = name;
      fromSuggs.classList.remove('visible');
      clearFrom.classList.add('visible');
      // Jump to that scene
      var s = findSceneById(id);
      if (s) switchScene(s);
      validateRouteBtn();
    }, 'from');
  });

  fromInput.addEventListener('focus', function () {
    renderFieldSuggestions(fromInput.value.trim(), fromSuggs, function (id, name) {
      fromSceneId = id;
      fromInput.value = name;
      fromSuggs.classList.remove('visible');
      clearFrom.classList.add('visible');
      var s = findSceneById(id);
      if (s) switchScene(s);
      validateRouteBtn();
    }, 'from');
  });

  clearFrom.addEventListener('click', function () {
    fromInput.value = ''; fromSceneId = null;
    clearFrom.classList.remove('visible');
    fromSuggs.classList.remove('visible');
    validateRouteBtn();
  });

  // ── To field ──
  toInput.addEventListener('input', function () {
    toSceneId = null;
    clearTo.classList.toggle('visible', toInput.value.trim().length > 0);
    validateRouteBtn();
    renderFieldSuggestions(toInput.value.trim(), toSuggs, function (id, name) {
      toSceneId = id;
      toInput.value = name;
      toSuggs.classList.remove('visible');
      clearTo.classList.add('visible');
      validateRouteBtn();
    }, 'to');
  });

  toInput.addEventListener('focus', function () {
    renderFieldSuggestions(toInput.value.trim(), toSuggs, function (id, name) {
      toSceneId = id;
      toInput.value = name;
      toSuggs.classList.remove('visible');
      clearTo.classList.add('visible');
      validateRouteBtn();
    }, 'to');
  });

  clearTo.addEventListener('click', function () {
    toInput.value = ''; toSceneId = null;
    clearTo.classList.remove('visible');
    toSuggs.classList.remove('visible');
    validateRouteBtn();
  });

  // ── Swap ──
  swapBtn.addEventListener('click', function () {
    var tmpId   = fromSceneId,  tmpName = fromInput.value;
    fromSceneId = toSceneId;    fromInput.value = toInput.value;
    toSceneId   = tmpId;        toInput.value   = tmpName;
    clearFrom.classList.toggle('visible', fromInput.value.length > 0);
    clearTo.classList.toggle('visible',   toInput.value.length > 0);
    validateRouteBtn();
    if (fromSceneId) { var s = findSceneById(fromSceneId); if (s) switchScene(s); }
  });

  // ── Get Directions ──
  getRouteBtn.addEventListener('click', function () {
    if (!fromSceneId || !toSceneId) return;
    computeAndShowRoute(fromSceneId, toSceneId);
  });

  function renderFieldSuggestions(query, listEl, onSelect, field) {
    listEl.innerHTML = '';
    var results = [];
    data.scenes.forEach(function (sd) {
      var name = sd.name.trim(), lower = name.toLowerCase(), q = query.toLowerCase();
      var score = 0;
      if (!query)                      score = 1;
      else if (lower === q)            score = 100;
      else if (lower.startsWith(q))    score = 80;
      else if (lower.indexOf(q) !== -1) score = 60;
      else {
        var pos = 0, matched = 0;
        for (var ci = 0; ci < q.length; ci++) {
          var f = lower.indexOf(q[ci], pos);
          if (f !== -1) { matched++; pos = f + 1; }
        }
        if (matched === q.length) score = 30;
      }
      if (score > 0) results.push({ sd, score });
    });

    results.sort(function (a, b) { return b.score - a.score; });

    if (!results.length) {
      var li = document.createElement('li');
      li.classList.add('no-res');
      li.textContent = 'No results';
      listEl.appendChild(li);
      listEl.classList.add('visible');
      return;
    }

    results.forEach(function (r) {
      var li = document.createElement('li');
      var icon = document.createElement('span');
      icon.classList.add('sug-icon');
      icon.textContent = getSceneIcon(r.sd.name);
      var nameSpan = document.createElement('span');
      nameSpan.textContent = r.sd.name.trim();

      // Mark currently selected
      var isSelected = (field === 'from' && r.sd.id === fromSceneId) ||
                       (field === 'to'   && r.sd.id === toSceneId);
      if (isSelected) { li.classList.add('here'); nameSpan.textContent += ' ✓'; }

      li.appendChild(icon);
      li.appendChild(nameSpan);
      li.addEventListener('click', function () { if (!isSelected) onSelect(r.sd.id, r.sd.name.trim()); });
      listEl.appendChild(li);
    });

    listEl.classList.add('visible');
  }

  // Close suggestions on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#navPanel')) {
      fromSuggs.classList.remove('visible');
      toSuggs.classList.remove('visible');
    }
    if (!e.target.closest('#exploreSearchPanel')) {
      navSuggestions.classList.remove('visible');
    }
  });

  // ==========================================================
  // ROUTE COMPUTATION & SUMMARY
  // ==========================================================
  function computeAndShowRoute(fromId, toId) {
    var path = bfs(fromId, toId);
    if (!path) {
      showToast('⚠️ No connected path found between these locations.');
      return;
    }

    // Populate summary
    var fromData = findSceneDataById(fromId);
    var toData   = findSceneDataById(toId);
    routeFromLabel.textContent = fromData ? fromData.name.trim() : fromId;
    routeToLabel.textContent   = toData   ? toData.name.trim()   : toId;
    routeStepCount.textContent = (path.length - 1) + ' stop' + (path.length - 1 !== 1 ? 's' : '');

    // Build step list
    routeStepsList.innerHTML = '';
    path.forEach(function (scId, i) {
      var sd   = findSceneDataById(scId);
      var name = sd ? sd.name.trim() : scId;
      var step = document.createElement('div');
      step.classList.add('route-step');

      // Connector line (not for last)
      if (i < path.length - 1) {
        var connector = document.createElement('div');
        connector.classList.add('route-step-connector');
        step.appendChild(connector);
      }

      var numEl = document.createElement('div');
      numEl.classList.add('route-step-num');
      if (i === 0) { numEl.classList.add('start'); numEl.textContent = '🔵'; }
      else if (i === path.length - 1) { numEl.classList.add('end'); numEl.textContent = '📍'; }
      else { numEl.classList.add('mid'); numEl.textContent = i; }

      var nameEl = document.createElement('div');
      nameEl.classList.add('route-step-name');
      nameEl.textContent = name;

      var iconEl = document.createElement('div');
      iconEl.classList.add('route-step-icon');
      iconEl.textContent = getSceneIcon(name);

      step.appendChild(numEl);
      step.appendChild(nameEl);
      step.appendChild(iconEl);

      // Click to jump
      (function (sid) {
        step.style.cursor = 'pointer';
        step.addEventListener('click', function () {
          var s = findSceneById(sid);
          if (s) switchScene(s);
        });
      })(scId);

      routeStepsList.appendChild(step);
    });

    // Store path for guided navigation
    routeSummary._path     = path;
    routeSummary._fromId   = fromId;
    routeSummary._toId     = toId;

    navPanel.classList.add('hidden');
    routeSummary.classList.remove('hidden');
  }

  closeRouteSummary.addEventListener('click', function () {
    routeSummary.classList.add('hidden');
    navPanel.classList.remove('hidden');
  });

  startTourBtn.addEventListener('click', function () {
    var path = routeSummary._path;
    var toId = routeSummary._toId;
    if (!path || !toId) return;
    routeSummary.classList.add('hidden');
    navPanel.classList.add('hidden');
    startNavigation(path, toId);
    // Jump to first scene in path
    var firstScene = findSceneById(path[0]);
    if (firstScene && currentScene && currentScene.data.id !== path[0]) switchScene(firstScene);
  });

  // ==========================================================
  // GUIDED NAVIGATION
  // ==========================================================
  function startNavigation(path, destId) {
    navState.active = true;
    navState.path   = path;
    navState.destId = destId;
    navState.currentStepIndex = path.indexOf(currentScene ? currentScene.data.id : path[0]);
    if (navState.currentStepIndex === -1) navState.currentStepIndex = 0;

    var destData = findSceneDataById(destId);
    navDestName.textContent = destData ? destData.name.trim() : destId;

    navStatus.classList.remove('hidden');
    document.body.classList.add('nav-active');
    updateSceneListPathHighlights();
    updateNavForCurrentScene();
  }

  function cancelNavigation() {
    navState.active = false;
    navState.path   = [];
    navState.destId = null;
    navState.currentStepIndex = 0;
    navStatus.classList.add('hidden');
    document.body.classList.remove('nav-active');
    clearAllNavHotspotClasses();
    sceneElements.forEach(function (el) { el.classList.remove('nav-path-scene','nav-dest-scene'); });
  }

  navCancelBtn.addEventListener('click', cancelNavigation);

  function onSceneChangedDuringNav(newId) {
    if (!navState.active) return;
    var idx = navState.path.indexOf(newId);
    if (idx !== -1) navState.currentStepIndex = idx;
    if (newId === navState.destId) { onArrived(); return; }
    updateNavForCurrentScene();
    updateSceneListPathHighlights();
  }

  function onArrived() {
    clearAllNavHotspotClasses();
    var destData = findSceneDataById(navState.destId);
    showToast('🎉 You arrived at ' + (destData ? destData.name.trim() : 'destination') + '!');
    setTimeout(cancelNavigation, 3500);
  }

  function updateNavForCurrentScene() {
    if (!navState.active || !currentScene) return;
    clearAllNavHotspotClasses();
    var curId  = currentScene.data.id;
    var pathIdx = navState.path.indexOf(curId);
    var nextId  = (pathIdx !== -1 && pathIdx < navState.path.length - 1)
                  ? navState.path[pathIdx + 1] : null;

    if (nextId) {
      (navState.hotspotElements[curId] || []).forEach(function (el) {
        if (el.getAttribute('data-hotspot-target') === nextId) el.classList.add('nav-next-hotspot');
      });
    }

    if (pathIdx !== -1) navState.currentStepIndex = pathIdx;
    updateStatusBar();
    rebuildStepDots();
  }

  function clearAllNavHotspotClasses() {
    document.querySelectorAll('.link-hotspot.nav-next-hotspot').forEach(function (el) {
      el.classList.remove('nav-next-hotspot');
    });
  }

  function updateStatusBar() {
    var path = navState.path, idx = navState.currentStepIndex;
    var remaining = path.length - 1 - idx;
    if (remaining <= 0) {
      navStatusStep.textContent = 'Almost there!';
    } else {
      var nextData = findSceneDataById(path[idx + 1]);
      navStatusStep.textContent = remaining + ' stop' + (remaining !== 1 ? 's' : '') + ' away · Next: ' + (nextData ? nextData.name.trim() : '');
    }
  }

  function rebuildStepDots() {
    navStepDots.innerHTML = '';
    var path = navState.path, cur = navState.currentStepIndex;
    path.forEach(function (scId, i) {
      if (i > 0) {
        var line = document.createElement('div');
        line.classList.add('nav-step-line');
        if (i <= cur) line.classList.add('done');
        navStepDots.appendChild(line);
      }
      var dot = document.createElement('div');
      dot.classList.add('nav-step-dot', i < cur ? 'done' : i === cur ? 'current' : 'future');
      var sd = findSceneDataById(scId);
      dot.title = sd ? sd.name.trim() : scId;
      (function (sid) {
        dot.addEventListener('click', function () { var s = findSceneById(sid); if (s) switchScene(s); });
      })(scId);
      navStepDots.appendChild(dot);
    });
    navStepLabel.textContent = 'Step ' + (cur + 1) + ' of ' + path.length;
  }

  function updateSceneListPathHighlights() {
    sceneElements.forEach(function (el) { el.classList.remove('nav-path-scene','nav-dest-scene'); });
    if (!navState.active) return;
    var path = navState.path, cur = navState.currentStepIndex, dest = navState.destId;
    for (var i = cur + 1; i < path.length - 1; i++) {
      var el = document.querySelector('#sceneList .scene[data-id="' + path[i] + '"]');
      if (el) el.classList.add('nav-path-scene');
    }
    var destEl = document.querySelector('#sceneList .scene[data-id="' + dest + '"]');
    if (destEl) destEl.classList.add('nav-dest-scene');
  }

  // ==========================================================
  // EXPLORE MODE — SEARCH
  // ==========================================================
  navSearchInput.addEventListener('input', function () {
    var q = navSearchInput.value.trim();
    navClearBtn.classList.toggle('visible', q.length > 0);
    renderExploreSuggestions(q);
  });

  navSearchInput.addEventListener('focus', function () {
    renderExploreSuggestions(navSearchInput.value.trim());
  });

  navSearchInput.addEventListener('keydown', function (e) {
    var items = navSuggestions.querySelectorAll('li:not(.no-results):not(.current-scene)');
    var highlighted = navSuggestions.querySelector('li.highlighted');
    var idx = -1;
    items.forEach(function (el, i) { if (el === highlighted) idx = i; });
    if (e.key === 'ArrowDown') { e.preventDefault(); if (idx < items.length - 1) { if (highlighted) highlighted.classList.remove('highlighted'); items[idx+1].classList.add('highlighted'); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx > 0) { highlighted.classList.remove('highlighted'); items[idx-1].classList.add('highlighted'); } }
    else if (e.key === 'Enter') { if (highlighted) highlighted.click(); else if (items.length === 1) items[0].click(); }
    else if (e.key === 'Escape') { navSuggestions.classList.remove('visible'); navSearchInput.blur(); }
  });

  navClearBtn.addEventListener('click', function () {
    navSearchInput.value = ''; navClearBtn.classList.remove('visible');
    navSuggestions.classList.remove('visible'); navSearchInput.focus();
  });

  function renderExploreSuggestions(query) {
    navSuggestions.innerHTML = '';
    var curId = currentScene ? currentScene.data.id : null;
    var results = [];

    data.scenes.forEach(function (sd) {
      var name = sd.name.trim(), lower = name.toLowerCase(), q = query.toLowerCase();
      var score = 0;
      if (!query)                       score = 1;
      else if (lower === q)             score = 100;
      else if (lower.startsWith(q))     score = 80;
      else if (lower.indexOf(q) !== -1) score = 60;
      else {
        var pos = 0, matched = 0;
        for (var ci = 0; ci < q.length; ci++) {
          var f = lower.indexOf(q[ci], pos);
          if (f !== -1) { matched++; pos = f + 1; }
        }
        if (matched === q.length) score = 30;
      }
      if (score > 0) {
        var path = curId ? bfs(curId, sd.id) : null;
        results.push({ sd, score, steps: path ? path.length - 1 : null });
      }
    });

    results.sort(function (a, b) { if (b.score !== a.score) return b.score - a.score; if (a.steps !== null && b.steps !== null) return a.steps - b.steps; return 0; });

    if (!results.length) {
      var li = document.createElement('li'); li.classList.add('no-results'); li.textContent = 'No matching places';
      navSuggestions.appendChild(li);
      navSuggestions.classList.add('visible');
      return;
    }

    results.forEach(function (r) {
      var li = document.createElement('li');
      var icon = document.createElement('span'); icon.classList.add('nav-suggest-icon'); icon.textContent = getSceneIcon(r.sd.name);
      var nameSpan = document.createElement('span'); nameSpan.textContent = r.sd.name.trim();
      li.appendChild(icon); li.appendChild(nameSpan);

      if (r.sd.id === curId) {
        li.classList.add('current-scene');
        var tag = document.createElement('span'); tag.classList.add('nav-suggest-steps'); tag.textContent = 'Here';
        li.appendChild(tag);
      } else {
        if (r.steps !== null) {
          var tag = document.createElement('span'); tag.classList.add('nav-suggest-steps');
          tag.textContent = r.steps === 1 ? '1 step' : r.steps + ' steps';
          li.appendChild(tag);
        }
        li.addEventListener('click', function () {
          var s = findSceneById(r.sd.id);
          if (s) switchScene(s);
          navSuggestions.classList.remove('visible');
          navSearchInput.value = '';
          navClearBtn.classList.remove('visible');
        });
      }
      navSuggestions.appendChild(li);
    });

    navSuggestions.classList.add('visible');
  }

  // ==========================================================
  // QR CODE SCANNER
  // ==========================================================
  var qrScanTarget = 'from'; // which field to fill
  var qrStream = null;
  var qrAnimFrame = null;

  qrScanFromBtn.addEventListener('click', function () { openQRModal('from'); });
  qrModalClose.addEventListener('click', closeQRModal);

  function openQRModal(target) {
    qrScanTarget = target;
    qrModal.classList.remove('hidden');
    qrResult.classList.add('hidden');
    qrError.classList.add('hidden');
    startQRCamera();
  }

  function closeQRModal() {
    qrModal.classList.add('hidden');
    stopQRCamera();
  }

  function startQRCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showQRError('Camera not supported on this device.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        qrStream = stream;
        qrVideo.srcObject = stream;
        qrVideo.play();
        qrScanFrame();
      })
      .catch(function (err) {
        showQRError('Camera access denied or unavailable. Please use manual selection below.');
        console.warn('QR camera error:', err);
      });
  }

  function stopQRCamera() {
    if (qrAnimFrame) { cancelAnimationFrame(qrAnimFrame); qrAnimFrame = null; }
    if (qrStream) { qrStream.getTracks().forEach(function (t) { t.stop(); }); qrStream = null; }
    qrVideo.srcObject = null;
  }

  function qrScanFrame() {
    if (!qrModal || qrModal.classList.contains('hidden')) return;
    if (qrVideo.readyState === qrVideo.HAVE_ENOUGH_DATA) {
      var ctx = qrCanvas.getContext('2d');
      qrCanvas.width  = qrVideo.videoWidth;
      qrCanvas.height = qrVideo.videoHeight;
      ctx.drawImage(qrVideo, 0, 0);
      var imageData = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      var code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' }) : null;
      if (code) {
        onQRDetected(code.data);
        return; // stop scanning
      }
    }
    qrAnimFrame = requestAnimationFrame(qrScanFrame);
  }

  // QR code format: "navsri:scene:<scene-id>"  or just the scene-id
  function onQRDetected(raw) {
    stopQRCamera();
    var sceneId = raw;
    if (raw.startsWith('navsri:scene:')) sceneId = raw.slice('navsri:scene:'.length);

    var sd = findSceneDataById(sceneId);
    if (!sd) {
      showQRError('QR code not recognised as a NavSri location.');
      return;
    }

    qrResultText.textContent = 'Detected: ' + sd.name.trim();
    qrResult.classList.remove('hidden');

    setTimeout(function () {
      applyQRResult(sd.id, sd.name.trim());
    }, 1000);
  }

  function applyQRResult(sceneId, sceneName) {
    closeQRModal();
    if (qrScanTarget === 'from') {
      fromSceneId    = sceneId;
      fromInput.value = sceneName;
      clearFrom.classList.add('visible');
      var s = findSceneById(sceneId);
      if (s) switchScene(s);
    } else {
      toSceneId    = sceneId;
      toInput.value = sceneName;
      clearTo.classList.add('visible');
    }
    validateRouteBtn();
    showToast('📍 Location set: ' + sceneName);
  }

  function showQRError(msg) {
    qrError.textContent = msg;
    qrError.classList.remove('hidden');
  }

  // Manual QR select
  qrManualSelect.addEventListener('change', function () {
    qrManualConfirm.disabled = !qrManualSelect.value;
  });

  qrManualConfirm.addEventListener('click', function () {
    var id = qrManualSelect.value;
    if (!id) return;
    var sd = findSceneDataById(id);
    if (sd) applyQRResult(sd.id, sd.name.trim());
  });

  // ==========================================================
  // TOAST
  // ==========================================================
  function showToast(msg) {
    var existing = document.getElementById('navsri-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'navsri-toast';
    toast.style.cssText = [
      'position:fixed','bottom:170px','left:50%','transform:translateX(-50%) translateY(10px)',
      'background:rgba(8,14,28,0.96)','color:#e0f0e8',
      'border:1px solid rgba(93,240,154,0.35)','border-radius:12px',
      'padding:11px 20px','font-size:13px','font-weight:600',
      'font-family:Inter,sans-serif','z-index:9999',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'backdrop-filter:blur(14px)',
      'pointer-events:none',
      'white-space:nowrap',
      'transition:opacity 0.35s,transform 0.35s',
      'opacity:0'
    ].join(';');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 380);
    }, 2800);
  }

})();
