/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Navigation UI elements
  var navSearchInput = document.getElementById('navSearchInput');
  var navSuggestions = document.getElementById('navSuggestions');
  var navClearBtn = document.getElementById('navClearBtn');
  var navStatus = document.getElementById('navStatus');
  var navDestName = document.getElementById('navDestName');
  var navStatusStep = document.getElementById('navStatusStep');
  var navCancelBtn = document.getElementById('navCancelBtn');
  var navStepDots = document.getElementById('navStepDots');
  var navStepLabel = document.getElementById('navStepLabel');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // =========================================================
  // SCENE GRAPH — map of scene id → list of connected scene ids
  // This is derived from linkHotspots in data.js
  // =========================================================
  var sceneGraph = {}; // { sceneId: [ {targetId, hotspotIndex} ] }
  data.scenes.forEach(function(sceneData) {
    sceneGraph[sceneData.id] = sceneData.linkHotspots.map(function(hs) {
      return { targetId: hs.target };
    });
  });

  // =========================================================
  // BFS PATHFINDING
  // Returns array of scene IDs from startId to destId (inclusive),
  // or null if no path exists.
  // =========================================================
  function findPath(startId, destId) {
    if (startId === destId) return [startId];
    var visited = {};
    var queue = [[startId]];
    visited[startId] = true;
    while (queue.length > 0) {
      var path = queue.shift();
      var current = path[path.length - 1];
      var neighbors = sceneGraph[current] || [];
      for (var i = 0; i < neighbors.length; i++) {
        var next = neighbors[i].targetId;
        if (visited[next]) continue;
        var newPath = path.concat([next]);
        if (next === destId) return newPath;
        visited[next] = true;
        queue.push(newPath);
      }
    }
    return null; // no path
  }

  // =========================================================
  // NAVIGATION STATE
  // =========================================================
  var navState = {
    active: false,
    path: [],          // full array of scene IDs
    destId: null,
    currentStepIndex: 0,
    hotspotElements: {} // sceneId -> [DOM elements of link hotspots]
  };

  // =========================================================
  // Create scenes
  // =========================================================
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    var linkElements = [];
    data.linkHotspots.forEach(function(hotspot, idx) {
      var element = createLinkHotspotElement(hotspot);
      element.setAttribute('data-hotspot-target', hotspot.target);
      element.setAttribute('data-scene-id', data.id);
      element.setAttribute('data-hotspot-index', idx);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      linkElements.push(element);
    });
    navState.hotspotElements[data.id] = linkElements;

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  // Current scene tracker
  var currentScene = null;

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
    currentScene = scene;

    // If navigation is active, update the navigation state for the new scene
    if (navState.active) {
      onSceneChangedDuringNav(scene.data.id);
    }
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
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

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);


  // =========================================================
  // NAVIGATION SYSTEM
  // =========================================================

  // Scene icon map — visual icons per scene type for the dropdown
  var sceneIcons = {
    'entrance': '🚪', 'gate': '🚪',
    'garden': '🌿', 'temple': '🛕',
    'nursing': '🏥', 'engineering': '🏗️',
    'stage': '🎭', 'office': '🏢',
    'principal': '👨‍💼', 'floor': '🏢',
    'lab': '🔬', 'physics': '⚛️', 'cse': '💻',
    'ethno': '🏛️', 'nexus': '🌐',
    'aids': '💡', 'wrkube': '🧊', 'csbs': '📐',
    'auditorium': '🎪', 'default': '📍'
  };

  function getSceneIcon(name) {
    var lower = name.toLowerCase();
    for (var key in sceneIcons) {
      if (lower.indexOf(key) !== -1) return sceneIcons[key];
    }
    return sceneIcons['default'];
  }

  // ---- Search Input Logic ----
  navSearchInput.addEventListener('input', function() {
    var query = navSearchInput.value.trim();
    navClearBtn.classList.toggle('visible', query.length > 0);
    renderSuggestions(query);
  });

  navSearchInput.addEventListener('focus', function() {
    var query = navSearchInput.value.trim();
    renderSuggestions(query);
  });

  navSearchInput.addEventListener('keydown', function(e) {
    var items = navSuggestions.querySelectorAll('li:not(.no-results):not(.current-scene)');
    var highlighted = navSuggestions.querySelector('li.highlighted');
    var idx = -1;
    items.forEach(function(el, i) { if (el === highlighted) idx = i; });

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < items.length - 1) {
        if (highlighted) highlighted.classList.remove('highlighted');
        items[idx + 1].classList.add('highlighted');
        items[idx + 1].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        highlighted.classList.remove('highlighted');
        items[idx - 1].classList.add('highlighted');
        items[idx - 1].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      if (highlighted) {
        highlighted.click();
      } else if (items.length === 1) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      closeSuggestions();
      navSearchInput.blur();
    }
  });

  navClearBtn.addEventListener('click', function() {
    navSearchInput.value = '';
    navClearBtn.classList.remove('visible');
    closeSuggestions();
    navSearchInput.focus();
  });

  // Close suggestions when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#navPanel')) {
      closeSuggestions();
    }
  });

  function closeSuggestions() {
    navSuggestions.classList.remove('visible');
  }

  function renderSuggestions(query) {
    navSuggestions.innerHTML = '';
    var currentId = currentScene ? currentScene.data.id : null;

    // Score and filter scenes
    var results = [];
    data.scenes.forEach(function(sceneData) {
      var name = sceneData.name.trim();
      var lower = name.toLowerCase();
      var q = query.toLowerCase();

      var score = 0;
      if (!query) {
        score = 1; // show all when empty
      } else if (lower === q) {
        score = 100;
      } else if (lower.startsWith(q)) {
        score = 80;
      } else if (lower.indexOf(q) !== -1) {
        score = 60;
      } else {
        // fuzzy: every char in q appears in order in lower
        var pos = 0;
        var matched = 0;
        for (var ci = 0; ci < q.length; ci++) {
          var found = lower.indexOf(q[ci], pos);
          if (found !== -1) { matched++; pos = found + 1; }
        }
        if (matched === q.length) score = 30;
      }

      if (score > 0) {
        var path = currentId ? findPath(currentId, sceneData.id) : null;
        var steps = path ? path.length - 1 : null;
        results.push({ sceneData: sceneData, score: score, steps: steps });
      }
    });

    // Sort: by score desc, then by steps asc
    results.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.steps !== null && b.steps !== null) return a.steps - b.steps;
      return 0;
    });

    if (results.length === 0) {
      var noRes = document.createElement('li');
      noRes.classList.add('no-results');
      noRes.textContent = 'No matching places found';
      navSuggestions.appendChild(noRes);
      navSuggestions.classList.add('visible');
      return;
    }

    results.forEach(function(result) {
      var li = document.createElement('li');
      var icon = document.createElement('span');
      icon.classList.add('nav-suggest-icon');
      icon.textContent = getSceneIcon(result.sceneData.name);

      var nameSpan = document.createElement('span');
      nameSpan.textContent = result.sceneData.name.trim();

      li.appendChild(icon);
      li.appendChild(nameSpan);

      if (result.sceneData.id === currentId) {
        li.classList.add('current-scene');
        var curTag = document.createElement('span');
        curTag.classList.add('nav-suggest-steps');
        curTag.textContent = 'You are here';
        li.appendChild(curTag);
      } else {
        if (result.steps !== null) {
          var stepsTag = document.createElement('span');
          stepsTag.classList.add('nav-suggest-steps');
          stepsTag.textContent = result.steps === 1 ? '1 step' : result.steps + ' steps';
          li.appendChild(stepsTag);
        }

        li.addEventListener('click', function() {
          startNavigation(result.sceneData.id);
          closeSuggestions();
          navSearchInput.value = '';
          navClearBtn.classList.remove('visible');
        });
      }

      navSuggestions.appendChild(li);
    });

    navSuggestions.classList.add('visible');
  }

  // ---- Start Navigation ----
  function startNavigation(destId) {
    var currentId = currentScene ? currentScene.data.id : scenes[0].data.id;
    var path = findPath(currentId, destId);

    if (!path || path.length === 0) {
      showToast('⚠️ No path found to that location.');
      return;
    }

    navState.active = true;
    navState.path = path;
    navState.destId = destId;
    navState.currentStepIndex = 0;

    var destScene = findSceneDataById(destId);
    navDestName.textContent = destScene ? destScene.name.trim() : destId;

    // Show status bar
    navStatus.classList.remove('hidden');
    document.body.classList.add('nav-active');

    // Update scene list to show path
    updateSceneListPathHighlights();

    // Update glow and status for current position
    updateNavForCurrentScene();
  }

  // ---- Cancel Navigation ----
  function cancelNavigation() {
    navState.active = false;
    navState.path = [];
    navState.destId = null;
    navState.currentStepIndex = 0;

    navStatus.classList.add('hidden');
    document.body.classList.remove('nav-active');

    // Remove all hotspot glow classes
    clearAllNavHotspotClasses();

    // Remove scene list path highlights
    sceneElements.forEach(function(el) {
      el.classList.remove('nav-path-scene', 'nav-dest-scene');
    });
  }

  navCancelBtn.addEventListener('click', cancelNavigation);

  // ---- Called when user moves to a new scene during navigation ----
  function onSceneChangedDuringNav(newSceneId) {
    if (!navState.active) return;

    // Find if newSceneId is in the path
    var pathIdx = navState.path.indexOf(newSceneId);

    if (pathIdx !== -1) {
      // Move the step index forward
      navState.currentStepIndex = pathIdx;
    }

    // If we've arrived at the destination
    if (newSceneId === navState.destId) {
      onArrived();
      return;
    }

    updateNavForCurrentScene();
    updateSceneListPathHighlights();
  }

  // ---- Called when user arrives at the destination ----
  function onArrived() {
    clearAllNavHotspotClasses();
    showToast('🎉 You have arrived at ' + (findSceneDataById(navState.destId) || {name:''}).name + '!');
    setTimeout(function() { cancelNavigation(); }, 3000);
  }

  // ---- Update glowing hotspot for current scene ----
  function updateNavForCurrentScene() {
    if (!navState.active || !currentScene) return;

    clearAllNavHotspotClasses();

    var currentId = currentScene.data.id;
    var pathIdx = navState.path.indexOf(currentId);

    // Determine the next scene in the path
    var nextId = null;
    if (pathIdx !== -1 && pathIdx < navState.path.length - 1) {
      nextId = navState.path[pathIdx + 1];
    }

    if (nextId) {
      // Find the hotspot on the current scene that leads to nextId
      var hotspots = navState.hotspotElements[currentId] || [];
      hotspots.forEach(function(el) {
        if (el.getAttribute('data-hotspot-target') === nextId) {
          el.classList.add('nav-next-hotspot');
        }
      });
    }

    // Update the step index
    if (pathIdx !== -1) navState.currentStepIndex = pathIdx;

    // Update the status bar text
    updateStatusBar();

    // Rebuild the step dots
    rebuildStepDots();
  }

  function clearAllNavHotspotClasses() {
    document.querySelectorAll('.link-hotspot.nav-next-hotspot').forEach(function(el) {
      el.classList.remove('nav-next-hotspot');
    });
  }

  function updateStatusBar() {
    var path = navState.path;
    var idx = navState.currentStepIndex;
    var remaining = path.length - 1 - idx;

    if (remaining <= 0) {
      navStatusStep.textContent = 'You are almost there!';
    } else if (remaining === 1) {
      var nextScene = findSceneDataById(path[idx + 1]);
      navStatusStep.textContent = 'Next: ' + (nextScene ? nextScene.name.trim() : '') + ' — then you\'ve arrived!';
    } else {
      var nextScene = findSceneDataById(path[idx + 1]);
      navStatusStep.textContent = remaining + ' stops away · Next: ' + (nextScene ? nextScene.name.trim() : '');
    }
  }

  function rebuildStepDots() {
    navStepDots.innerHTML = '';
    var path = navState.path;
    var currentIdx = navState.currentStepIndex;

    path.forEach(function(sceneId, i) {
      if (i > 0) {
        var line = document.createElement('div');
        line.classList.add('nav-step-line');
        if (i <= currentIdx) line.classList.add('done');
        navStepDots.appendChild(line);
      }

      var dot = document.createElement('div');
      dot.classList.add('nav-step-dot');
      if (i < currentIdx) {
        dot.classList.add('done');
      } else if (i === currentIdx) {
        dot.classList.add('current');
      } else {
        dot.classList.add('future');
      }

      var scData = findSceneDataById(sceneId);
      dot.title = scData ? scData.name.trim() : sceneId;

      // Click on a dot to jump there
      (function(sid) {
        dot.addEventListener('click', function() {
          var s = findSceneById(sid);
          if (s) switchScene(s);
        });
      })(sceneId);

      navStepDots.appendChild(dot);
    });

    // Step label
    var done = currentIdx + 1;
    var total = path.length;
    navStepLabel.textContent = 'Step ' + done + ' of ' + total;
  }

  function updateSceneListPathHighlights() {
    // First clear all
    sceneElements.forEach(function(el) {
      el.classList.remove('nav-path-scene', 'nav-dest-scene');
    });

    if (!navState.active) return;

    var path = navState.path;
    var destId = navState.destId;
    var currentIdx = navState.currentStepIndex;

    // Mark future path steps (not yet visited)
    for (var i = currentIdx + 1; i < path.length - 1; i++) {
      var el = document.querySelector('#sceneList .scene[data-id="' + path[i] + '"]');
      if (el) el.classList.add('nav-path-scene');
    }

    // Mark destination
    var destEl = document.querySelector('#sceneList .scene[data-id="' + destId + '"]');
    if (destEl) destEl.classList.add('nav-dest-scene');
  }

  // ---- Toast notification ----
  function showToast(msg) {
    var toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed', 'bottom:160px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(10,16,30,0.95)', 'color:#e8f8e8',
      'border:1px solid rgba(93,240,154,0.4)', 'border-radius:12px',
      'padding:12px 20px', 'font-size:13px', 'font-weight:600',
      'font-family:Inter,sans-serif', 'z-index:9999',
      'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'backdrop-filter:blur(16px)',
      'pointer-events:none',
      'white-space:nowrap',
      'animation:toastIn 0.3s ease'
    ].join(';');
    toast.textContent = msg;

    var style = document.createElement('style');
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.transition = 'opacity 0.4s';
      toast.style.opacity = '0';
      setTimeout(function() { document.body.removeChild(toast); }, 400);
    }, 2800);
  }

})();
