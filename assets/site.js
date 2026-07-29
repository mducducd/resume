(() => {
    document.documentElement.classList.add("js");

    const DEFAULT_THEME = "light";
    const THEME_STORAGE_KEY = "portfolio-theme";
    const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
    const PLAYER_STATE_STORAGE_KEY = "portfolio-soundcloud-player";
    const SOUNDCLOUD_API_SRC = "https://w.soundcloud.com/player/api.js";
    const SOUNDCLOUD_PLAYER_SRC = "https://w.soundcloud.com/player/";
    const NOOP_OVERLAY = {
        closeProjectDemo: () => {},
        closeLightbox: () => {},
        isOpen: () => false
    };
    const PLAYLISTS = {
        1: {
            iframeId: "sc-widget-iframe-1",
            listId: "track-list-1",
            loadingId: "track-loading-1",
            playlistUrl: "https://soundcloud.com/minh-duc-nguyen-967585376/sets/random-rhymes-for-lovely-minds",
            tracks: [],
            currentTrackIndex: -1,
            widget: null,
            initialized: false
        },
        2: {
            iframeId: "sc-widget-iframe-2",
            listId: "track-list-2",
            loadingId: "track-loading-2",
            playlistUrl: "https://soundcloud.com/minh-duc-nguyen-967585376/sets/time-dissolve-here",
            tracks: [],
            currentTrackIndex: -1,
            widget: null,
            initialized: false
        }
    };
    let soundCloudApiPromise = null;
    let soundCloudPlayerWidget = null;
    let soundCloudActivePlaylistIndex = null;
    let soundCloudCloseBound = false;
    let soundCloudStateRestored = false;
    const siteState = {
        currentFeatures: {
            projectDemos: NOOP_OVERLAY,
            lightbox: NOOP_OVERLAY
        },
        loadedScriptUrls: new Set(Array.from(document.scripts || []).map((script) => script.src).filter(Boolean)),
        navigationToken: 0,
        topbarDocumentBound: false,
        topbarScrollBound: false,
        pageTransitionsBound: false,
        escapeBound: false,
        clientNavigationBound: false
    };

    function getBasePrefix() {
        const page = document.body ? document.body.getAttribute("data-page") || "" : "";

        return page === "home" ? "" : "../";
    }

    function getAssetPath(relativePath) {
        return getBasePrefix() + String(relativePath || "").replace(/^\.\//, "");
    }

    function prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches);
    }

    function safeInit(initializer, fallbackValue) {
        try {
            const result = initializer();

            return typeof result === "undefined" ? fallbackValue : result;
        } catch (error) {
            return fallbackValue;
        }
    }

    function initTopbar() {
        const topbar = document.querySelector(".topbar");

        if (!topbar) {
            return;
        }

        normalizePrimaryNav(topbar);

        const onScroll = () => {
            const currentTopbar = document.querySelector(".topbar");

            if (currentTopbar) {
                currentTopbar.classList.toggle("scrolled", window.scrollY > 40);
            }
        };

        if (!siteState.topbarScrollBound) {
            window.addEventListener("scroll", onScroll, { passive: true });
            siteState.topbarScrollBound = true;
        }
        onScroll();

        if (!siteState.topbarDocumentBound) {
            document.addEventListener("click", (event) => {
                const currentTopbar = document.querySelector(".topbar");
                const currentToggle = currentTopbar ? currentTopbar.querySelector(".nav-toggle") : null;
                const currentNav = currentTopbar ? currentTopbar.querySelector(".nav") : null;
                const clickTarget = event.target && event.target.closest ? event.target.closest(".nav-toggle, .nav a") : null;

                if (!currentTopbar || !currentToggle || !currentNav) {
                    return;
                }

                if (clickTarget && clickTarget.classList.contains("nav-toggle")) {
                    const open = currentTopbar.classList.toggle("nav-open");
                    currentToggle.setAttribute("aria-expanded", open ? "true" : "false");
                    return;
                }

                if (clickTarget && currentNav.contains(clickTarget)) {
                    currentTopbar.classList.remove("nav-open");
                    currentToggle.setAttribute("aria-expanded", "false");
                    return;
                }

                if (!currentTopbar.contains(event.target)) {
                    currentTopbar.classList.remove("nav-open");
                    currentToggle.setAttribute("aria-expanded", "false");
                }
            });
            siteState.topbarDocumentBound = true;
        }

        const navToggle = topbar.querySelector(".nav-toggle");
        const nav = topbar.querySelector(".nav");

        if (navToggle && nav) {
            navToggle.setAttribute("aria-expanded", topbar.classList.contains("nav-open") ? "true" : "false");
        }
    }

    function normalizePrimaryNav(topbar) {
        const nav = topbar.querySelector(".nav");

        if (!nav) {
            return;
        }

        const page = document.body.getAttribute("data-page") || "";
        const prefix = getBasePrefix();
        const items = [
            { label: "Work", href: prefix + "work/", key: "/work" },
            { label: "Study", href: prefix + "study/", key: "/study" },
            { label: "Blog", href: prefix + "blog/", key: "/blog" },
            { label: "Offline", href: prefix + "offline/", key: "/offline" }
        ];

        nav.replaceChildren();
        items.forEach((item) => {
            const link = document.createElement("a");
            link.href = item.href;
            link.textContent = item.label;

            if (page === item.key.slice(1)) {
                link.setAttribute("aria-current", "page");
            }

            nav.appendChild(link);
        });
    }

    function toArray(value) {
        return Array.from(value || []);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function fetchJson(url, timeoutMs) {
        const controller = "AbortController" in window ? new AbortController() : null;
        let timeoutId = 0;

        if (controller) {
            timeoutId = window.setTimeout(() => {
                controller.abort();
            }, timeoutMs || 4500);
        }

        return window.fetch(url, {
            mode: "cors",
            signal: controller ? controller.signal : undefined
        }).then((response) => {
            if (!response.ok) {
                throw new Error("Request failed");
            }

            return response.json();
        }).finally(() => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        });
    }

    function getPlaylistWidgetSrc(playlistUrl) {
        return SOUNDCLOUD_PLAYER_SRC +
            "?url=" + encodeURIComponent(playlistUrl) +
            "&auto_play=false";
    }

    function loadSoundCloudApi() {
        if (window.SC && SC.Widget) {
            return Promise.resolve();
        }

        if (soundCloudApiPromise) {
            return soundCloudApiPromise;
        }

        soundCloudApiPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[src="' + SOUNDCLOUD_API_SRC + '"]');
            const script = existingScript || document.createElement("script");

            function handleLoad() {
                resolve();
            }

            function handleError() {
                soundCloudApiPromise = null;
                reject(new Error("Failed to load SoundCloud API"));
            }

            script.addEventListener("load", handleLoad, { once: true });
            script.addEventListener("error", handleError, { once: true });

            if (!existingScript) {
                script.src = SOUNDCLOUD_API_SRC;
                document.body.appendChild(script);
            }
        });

        return soundCloudApiPromise;
    }

    function ensureSoundCloudShell() {
        if (!document.body) {
            return null;
        }

        let playerBar = document.getElementById("player-bar");
        let playerClose = document.getElementById("player-close");
        let playerIframe = document.getElementById("sc-player");

        if (!playerBar) {
            playerBar = document.createElement("div");
            playerBar.id = "player-bar";
            playerBar.setAttribute("aria-live", "polite");
            playerBar.innerHTML =
                '<button id="player-close" type="button" aria-label="Close SoundCloud player" title="Close player">&#10005;</button>' +
                '<iframe id="sc-player" allow="autoplay" title="SoundCloud floating player"></iframe>';
            document.body.appendChild(playerBar);
            playerClose = playerBar.querySelector("#player-close");
            playerIframe = playerBar.querySelector("#sc-player");
        }

        Object.keys(PLAYLISTS).forEach((key) => {
            const playlist = PLAYLISTS[key];

            if (document.getElementById(playlist.iframeId)) {
                return;
            }

            const iframe = document.createElement("iframe");
            iframe.id = playlist.iframeId;
            iframe.title = "SoundCloud widget playlist " + key;
            iframe.allow = "autoplay";
            iframe.src = getPlaylistWidgetSrc(playlist.playlistUrl);
            iframe.tabIndex = -1;
            iframe.setAttribute("aria-hidden", "true");
            iframe.style.position = "absolute";
            iframe.style.left = "-9999px";
            iframe.style.width = "1px";
            iframe.style.height = "1px";
            iframe.style.border = "0";
            document.body.appendChild(iframe);
        });

        return {
            playerBar: playerBar,
            playerClose: playerClose || document.getElementById("player-close"),
            playerIframe: playerIframe || document.getElementById("sc-player")
        };
    }

    function readPlayerState() {
        try {
            const rawValue = window.sessionStorage.getItem(PLAYER_STATE_STORAGE_KEY);

            if (!rawValue) {
                return null;
            }

            const parsed = JSON.parse(rawValue);

            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function writePlayerState(state) {
        try {
            window.sessionStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            /* ignore storage failures */
        }
    }

    function clearPlayerState() {
        try {
            window.sessionStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
        } catch (error) {
            /* ignore storage failures */
        }
    }

    function preloadImage(src) {
        return new Promise((resolve, reject) => {
            if (!src) {
                reject(new Error("Missing image source"));
                return;
            }

            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
        });
    }

    function initTheme() {
        const themeToggle = document.getElementById("theme-toggle");

        function applyTheme(theme) {
            document.documentElement.setAttribute("data-theme", theme);
            document.body.setAttribute("data-theme", theme);

            if (!themeToggle) {
                return;
            }

            const themeToggleLabel = themeToggle.querySelector(".theme-toggle-label");

            if (themeToggleLabel) {
                themeToggleLabel.textContent = theme === "dark" ? "Light" : "Dark";
            }

            themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
            themeToggle.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
        }

        function getInitialTheme() {
            try {
                const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

                if (savedTheme === "light" || savedTheme === "dark") {
                    return savedTheme;
                }
            } catch (error) {
                /* ignore storage failures */
            }

            return document.documentElement.getAttribute("data-theme") ||
                document.body.getAttribute("data-theme") ||
                DEFAULT_THEME;
        }

        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                const currentTheme = document.body.getAttribute("data-theme");
                const nextTheme = currentTheme === "dark" ? "light" : "dark";
                applyTheme(nextTheme);

                try {
                    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
                } catch (error) {
                    /* ignore storage failures */
                }
            });
        }

        applyTheme(getInitialTheme());
    }

    function initPageTransitions() {
        const markReady = () => {
            window.requestAnimationFrame(() => {
                document.body.classList.add("is-ready");
                document.body.classList.remove("is-transitioning");
            });
        };

        markReady();
        if (!siteState.pageTransitionsBound) {
            window.addEventListener("pageshow", markReady);
            siteState.pageTransitionsBound = true;
        }
    }

    function initFooterYear() {
        const year = document.getElementById("year");

        if (year) {
            year.textContent = String(new Date().getFullYear());
        }
    }

    function initDresdenPhoto() {
        const dresdenPhoto = document.getElementById("dresden-photo");

        if (!dresdenPhoto) {
            return;
        }

        function isAcceptedDresdenAspectRatio(aspectRatio) {
            return aspectRatio >= 1.1 && aspectRatio <= 1.95;
        }

        function getDresdenPhotoAspectRatio(imageInfo) {
            const width = imageInfo ? (imageInfo.thumbwidth || imageInfo.width || 0) : 0;
            const height = imageInfo ? (imageInfo.thumbheight || imageInfo.height || 0) : 0;

            if (!width || !height) {
                return 0;
            }

            return width / height;
        }

        const dresdenFigure = document.getElementById("dresden-figure") || (dresdenPhoto.closest ? dresdenPhoto.closest(".dresden-figure") : null);
        const dresdenCaption = dresdenFigure ? dresdenFigure.querySelector("figcaption") : null;
        const fallbackPhoto = {
            image: getAssetPath("assets/dresden-fallback.jpg"),
            alt: "Daily landscape view from Germany",
            caption: "Daily view from Germany"
        };
        let photoSettled = false;
        let fallbackTimer = 0;

        function cleanCommonsText(value) {
            if (!value) {
                return "";
            }

            const scratch = document.createElement("div");
            scratch.innerHTML = String(value);

            return scratch.textContent
                .replace(/\s+/g, " ")
                .replace(/^description\s*/i, "")
                .replace(/^file:/i, "")
                .replace(/\.(jpg|jpeg|png|webp|gif|tif|tiff|svg)$/i, "")
                .replace(/[_-]+/g, " ")
                .trim();
        }

        function shortenCaption(text) {
            const cleanText = cleanCommonsText(text);

            if (cleanText.length <= 86) {
                return cleanText;
            }

            return cleanText.slice(0, 83).replace(/\s+\S*$/, "") + "...";
        }

        function getDresdenPhotoCaption(page) {
            const metadata = page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].extmetadata ? page.imageinfo[0].extmetadata : {};
            const objectName = metadata.ObjectName && metadata.ObjectName.value ? metadata.ObjectName.value : "";
            const imageDescription = metadata.ImageDescription && metadata.ImageDescription.value ? metadata.ImageDescription.value : "";
            const pageTitle = page && page.title ? page.title : "";

            return shortenCaption(objectName) || shortenCaption(imageDescription) || shortenCaption(pageTitle) || "Daily view from Germany";
        }

        function markFigureLoaded() {
            if (dresdenFigure) {
                dresdenFigure.classList.add("is-loaded");
            }
        }

        function settlePhoto() {
            photoSettled = true;

            if (fallbackTimer) {
                window.clearTimeout(fallbackTimer);
                fallbackTimer = 0;
            }
        }

        function applyDresdenPhoto(photo) {
            if (photoSettled) {
                return Promise.resolve(false);
            }

            if (!photo || !photo.image) {
                return Promise.reject(new Error("Missing Dresden photo"));
            }

            return preloadImage(photo.image).then((image) => {
                if (photoSettled) {
                    return false;
                }

                const aspectRatio = image && image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 0;
                const captionText = photo.caption || photo.alt || "Daily view from Germany";

                if (!isAcceptedDresdenAspectRatio(aspectRatio)) {
                    throw new Error("Rejected wide Dresden photo");
                }

                dresdenPhoto.src = photo.image;
                dresdenPhoto.alt = photo.alt || "Daily landscape view from Germany";
                if (dresdenCaption) {
                    dresdenCaption.textContent = captionText;
                }
                markFigureLoaded();
                settlePhoto();

                return true;
            });
        }

        function showFallbackPhoto() {
            if (photoSettled) {
                return;
            }

            applyDresdenPhoto(fallbackPhoto).catch(() => {
                if (photoSettled) {
                    return;
                }

                dresdenPhoto.removeAttribute("src");
                dresdenPhoto.alt = fallbackPhoto.alt;
                if (dresdenCaption) {
                    dresdenCaption.textContent = fallbackPhoto.caption;
                }
                markFigureLoaded();
                settlePhoto();
            });
        }

        function tryDresdenCandidates(candidates, index) {
            const candidate = candidates && typeof index === "number" ? candidates[index] : null;

            if (!candidate) {
                return Promise.reject(new Error("No acceptable Dresden photos found"));
            }

            const photo = {
                image: candidate.imageInfo.thumburl || candidate.imageInfo.url,
                alt: getDresdenPhotoCaption(candidate.page),
                caption: getDresdenPhotoCaption(candidate.page)
            };

            return applyDresdenPhoto(photo).catch(() => {
                return tryDresdenCandidates(candidates, index + 1);
            });
        }

        const searchUrls = [
            "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=Dresden%20Germany&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1600&format=json&origin=*",
            "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=Berlin%20Germany&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1600&format=json&origin=*"
        ];

        fallbackTimer = window.setTimeout(showFallbackPhoto, 4500);

        Promise.all(searchUrls.map((url) => fetchJson(url, 4500).catch(() => null)))
            .then((results) => {
                const pages = results.reduce((acc, data) => {
                    if (data && data.query && data.query.pages) {
                        Object.keys(data.query.pages).forEach((key) => {
                            acc.push(data.query.pages[key]);
                        });
                    }
                    return acc;
                }, []);
                const candidates = pages
                    .map((page) => {
                        const imageInfo = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0] : null;
                        const aspectRatio = getDresdenPhotoAspectRatio(imageInfo);
                        const title = page && page.title ? page.title.toLowerCase() : "";

                        return {
                            page: page,
                            imageInfo: imageInfo,
                            aspectRatio: aspectRatio,
                            isPanorama: title.indexOf("panorama") !== -1
                        };
                    })
                    .filter((candidate) => {
                        return candidate.imageInfo &&
                            (candidate.imageInfo.thumburl || candidate.imageInfo.url) &&
                            isAcceptedDresdenAspectRatio(candidate.aspectRatio) &&
                            !candidate.isPanorama;
                    })
                    .sort((a, b) => Math.abs(a.aspectRatio - 1.55) - Math.abs(b.aspectRatio - 1.55));
                const shortlist = candidates.slice(0, Math.min(candidates.length, 8));

                if (shortlist.length === 0) {
                    throw new Error("No Dresden photos found");
                }

                const startIndex = Math.floor(Math.random() * shortlist.length);
                const orderedCandidates = shortlist.slice(startIndex).concat(shortlist.slice(0, startIndex));

                return tryDresdenCandidates(orderedCandidates, 0);
            })
            .catch(() => {
                showFallbackPhoto();
            });
    }

    function initPlaylists() {
        const playlistToggles = toArray(document.querySelectorAll("[data-playlist-toggle]"));
        const soundCloudShell = ensureSoundCloudShell();
        const playerBar = soundCloudShell ? soundCloudShell.playerBar : null;
        const playerIframe = soundCloudShell ? soundCloudShell.playerIframe : null;
        const playerClose = soundCloudShell ? soundCloudShell.playerClose : null;
        const widgetIframes = Object.keys(PLAYLISTS).reduce((acc, key) => {
            acc[key] = document.getElementById(PLAYLISTS[key].iframeId);
            return acc;
        }, {});
        const savedPlayerState = readPlayerState();

        if (playlistToggles.length === 0 && !playerBar && !playerIframe && !playerClose) {
            return {
                closePlayer: () => {}
            };
        }

        function setPlaylistOpen(index, open) {
            const toggle = document.getElementById("playlist-toggle-" + index);
            const list = document.getElementById("track-list-" + index);

            if (!toggle || !list) {
                return;
            }

            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            list.setAttribute("aria-hidden", open ? "false" : "true");
            list.classList.toggle("open", open);
        }

        function togglePlaylist(index) {
            const toggle = document.getElementById("playlist-toggle-" + index);

            if (!toggle) {
                return;
            }

            setPlaylistOpen(index, toggle.getAttribute("aria-expanded") !== "true");
        }

        function closePlayer() {
            if (soundCloudPlayerWidget) {
                try {
                    soundCloudPlayerWidget.unbind(SC.Widget.Events.FINISH);
                } catch (error) {
                    /* ignore stale widget instances */
                }
            }

            if (playerBar) {
                playerBar.classList.remove("visible");
            }

            if (playerIframe) {
                playerIframe.onload = null;
                playerIframe.removeAttribute("src");
            }

            document.body.classList.remove("player-open");
            soundCloudActivePlaylistIndex = null;
            soundCloudPlayerWidget = null;
            clearPlayerState();

            Object.keys(PLAYLISTS).forEach((key) => {
                PLAYLISTS[key].currentTrackIndex = -1;
            });

            toArray(document.querySelectorAll(".track-item")).forEach((item) => {
                item.classList.remove("playing");
            });
        }

        function renderPlaylist(index, sounds) {
            const playlist = PLAYLISTS[index];
            const list = document.getElementById(playlist.listId);
            const loading = document.getElementById(playlist.loadingId);

            playlist.tracks = sounds || [];

            if (!list) {
                return;
            }

            if (loading) {
                loading.remove();
            }

            list.innerHTML = "";

            if (!sounds || sounds.length === 0) {
                list.innerHTML = '<div class="track-loading">No tracks found.</div>';
                return;
            }

            sounds.forEach((sound, soundIndex) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "track-item";
                if (Number(index) === Number(soundCloudActivePlaylistIndex) && soundIndex === playlist.currentTrackIndex) {
                    item.classList.add("playing");
                }
                item.innerHTML =
                    '<span class="track-index">' + String(soundIndex + 1).padStart(2, "0") + "</span>" +
                    "<span>" +
                        '<span class="track-title">' + escapeHtml(sound.title) + "</span>" +
                        '<span class="track-subtitle">' + escapeHtml((sound.user || {}).username || "") + "</span>" +
                    "</span>";
                item.addEventListener("click", () => {
                    playTrack(item, index, soundIndex);
                });
                list.appendChild(item);
            });
        }

        function updateTrackHighlight() {
            toArray(document.querySelectorAll(".track-item")).forEach((item) => {
                item.classList.remove("playing");
            });

            if (soundCloudActivePlaylistIndex === null) {
                return;
            }

            const playlist = PLAYLISTS[soundCloudActivePlaylistIndex];
            const items = toArray(document.querySelectorAll("#track-list-" + soundCloudActivePlaylistIndex + " .track-item"));

            if (!playlist || !items[playlist.currentTrackIndex]) {
                return;
            }

            items[playlist.currentTrackIndex].classList.add("playing");
        }

        function initializePlaylist(index) {
            const playlist = PLAYLISTS[index];
            const widgetIframe = widgetIframes[index];

            if (!playlist || !widgetIframe || !window.SC || !SC.Widget) {
                return;
            }

            playlist.widget = SC.Widget(widgetIframe);
            if (playlist.initialized) {
                renderPlaylist(index, playlist.tracks || []);
                return;
            }

            playlist.initialized = true;
            playlist.widget.bind(SC.Widget.Events.READY, () => {
                playlist.widget.getSounds((sounds) => {
                    renderPlaylist(index, sounds || []);
                });
            });
        }

        function playNextTrack() {
            if (soundCloudActivePlaylistIndex === null) {
                return;
            }

            const playlist = PLAYLISTS[soundCloudActivePlaylistIndex];

            if (!playlist || playlist.tracks.length === 0) {
                return;
            }

            const nextIndex = (playlist.currentTrackIndex + 1) % playlist.tracks.length;
            playTrack(null, soundCloudActivePlaylistIndex, nextIndex);
        }

        function bindPlayerFinish() {
            if (!window.SC || !SC.Widget || !playerIframe || !playerIframe.getAttribute("src")) {
                return;
            }

            if (soundCloudPlayerWidget) {
                try {
                    soundCloudPlayerWidget.unbind(SC.Widget.Events.FINISH);
                } catch (error) {
                    /* ignore stale widget instances */
                }
            }

            soundCloudPlayerWidget = SC.Widget(playerIframe);
            soundCloudPlayerWidget.bind(SC.Widget.Events.FINISH, () => {
                playNextTrack();
            });
        }

        function openPlayer(trackUrl, options) {
            if (!trackUrl || !playerIframe || !playerBar) {
                return;
            }

            if (playerBar) {
                playerBar.classList.add("visible");
            }

            document.body.classList.add("player-open");
            playerIframe.onload = bindPlayerFinish;
            playerIframe.src = SOUNDCLOUD_PLAYER_SRC + "?url=" +
                encodeURIComponent(trackUrl) +
                "&color=%2385906f&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false";

            if (options && options.persist !== false) {
                writePlayerState({
                    playlistIndex: options.playlistIndex,
                    trackIndex: options.trackIndex,
                    permalinkUrl: trackUrl
                });
            }
        }

        function playTrack(element, playlistIndex, trackIndex) {
            const playlist = PLAYLISTS[playlistIndex];

            if (!playlist || !playlist.tracks[trackIndex] || !playerIframe || !playerBar) {
                return;
            }

            soundCloudActivePlaylistIndex = playlistIndex;
            playlist.currentTrackIndex = trackIndex;
            updateTrackHighlight();
            openPlayer(playlist.tracks[trackIndex].permalink_url, {
                playlistIndex: playlistIndex,
                trackIndex: trackIndex
            });
        }

        playlistToggles.forEach((toggle) => {
            toggle.addEventListener("click", () => {
                togglePlaylist(toggle.getAttribute("data-playlist-toggle"));
            });
        });

        if (playerClose && !soundCloudCloseBound) {
            playerClose.addEventListener("click", closePlayer);
            soundCloudCloseBound = true;
        }

        if (!soundCloudStateRestored && savedPlayerState && savedPlayerState.permalinkUrl && playerIframe && !playerIframe.getAttribute("src")) {
            if (PLAYLISTS[savedPlayerState.playlistIndex]) {
                soundCloudActivePlaylistIndex = Number(savedPlayerState.playlistIndex);
                PLAYLISTS[soundCloudActivePlaylistIndex].currentTrackIndex = Number(savedPlayerState.trackIndex);
            }

            openPlayer(savedPlayerState.permalinkUrl, {
                playlistIndex: savedPlayerState.playlistIndex,
                trackIndex: savedPlayerState.trackIndex,
                persist: false
            });
            soundCloudStateRestored = true;
        }

        setPlaylistOpen(1, true);
        setPlaylistOpen(2, false);

        loadSoundCloudApi().then(() => {
            initializePlaylist(1);
            initializePlaylist(2);
            if (playerIframe && playerIframe.getAttribute("src")) {
                bindPlayerFinish();
            }
        }).catch(() => {
            Object.keys(PLAYLISTS).forEach((key) => {
                const loading = document.getElementById(PLAYLISTS[key].loadingId);

                if (loading) {
                    loading.textContent = "SoundCloud failed to load.";
                }
            });
        });

        return {
            closePlayer: closePlayer
        };
    }

    function initProjectMasonry() {
        const projectList = document.querySelector(".project-list");
        const projectItems = projectList ? toArray(projectList.querySelectorAll(".project-item")) : [];
        const MasonryConstructor = window.Masonry;
        let masonry = null;
        let layoutFrame = null;

        function refreshMasonry() {
            if (!masonry) {
                return;
            }

            if (layoutFrame) {
                window.cancelAnimationFrame(layoutFrame);
            }

            layoutFrame = window.requestAnimationFrame(() => {
                masonry.layout();
                layoutFrame = null;
            });
        }

        if (projectList && projectItems.length > 0 && typeof MasonryConstructor === "function") {
            projectList.classList.add("is-masonry-ready");
            masonry = new MasonryConstructor(projectList, {
                itemSelector: ".project-item",
                columnWidth: ".project-grid-sizer",
                gutter: ".project-gutter-sizer",
                percentPosition: true,
                transitionDuration: "0.22s"
            });

            if ("ResizeObserver" in window) {
                const observer = new ResizeObserver(refreshMasonry);

                projectItems.forEach((item) => {
                    observer.observe(item);
                });
            }

            toArray(projectList.querySelectorAll("img")).forEach((image) => {
                if (!image.complete) {
                    image.addEventListener("load", refreshMasonry, { once: true });
                }
            });

            window.addEventListener("resize", refreshMasonry);
            window.addEventListener("load", refreshMasonry, { once: true });
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(refreshMasonry).catch(() => {});
            }
            refreshMasonry();
        }

        return {
            refresh: refreshMasonry,
            getMasonry: () => masonry
        };
    }

    function initProjectDemos(projectMasonry) {
        const demoTriggers = toArray(document.querySelectorAll(".demo-trigger"));
        const projectDemoStage = document.getElementById("project-demo-stage");
        const projectDemoBody = document.getElementById("project-demo-body");
        const projectDemoClose = document.getElementById("project-demo-close");
        let activeDemoTarget = null;

        function refreshProjectMasonry() {
            if (projectMasonry && typeof projectMasonry.refresh === "function") {
                projectMasonry.refresh();
            }
        }

        if (!projectDemoStage || !projectDemoBody || demoTriggers.length === 0) {
            return {
                closeProjectDemo: () => {},
                isOpen: () => false
            };
        }

        const demoStageOriginalParent = projectDemoStage.parentNode;
        const demoStageOriginalNext = projectDemoStage.nextSibling;
        let demoResizeObserver = null;

        function placeDemoStageAfterRow(projectList, hostProject) {
            const items = toArray(projectList.querySelectorAll(".project-item"));
            const cardTop = hostProject.offsetTop;
            let lastInRow = hostProject;

            items.forEach((it) => {
                if (Math.abs(it.offsetTop - cardTop) < 6) {
                    lastInRow = it;
                }
            });

            projectDemoStage.classList.add("project-item");
            projectDemoStage.style.width = "100%";

            if (lastInRow.nextSibling) {
                projectList.insertBefore(projectDemoStage, lastInRow.nextSibling);
            } else {
                projectList.appendChild(projectDemoStage);
            }

            const masonry = projectMasonry && projectMasonry.getMasonry && projectMasonry.getMasonry();
            if (masonry) {
                masonry.reloadItems();
                masonry.layout();
            }

            if (typeof ResizeObserver === "function" && masonry) {
                demoResizeObserver = new ResizeObserver(() => {
                    masonry.layout();
                });
                demoResizeObserver.observe(projectDemoStage);
            }
        }

        function returnDemoStageHome() {
            if (demoResizeObserver) {
                demoResizeObserver.disconnect();
                demoResizeObserver = null;
            }

            const wasInProjectList = projectDemoStage.classList.contains("project-item");
            projectDemoStage.classList.remove("project-item");
            projectDemoStage.style.width = "";

            if (demoStageOriginalParent && projectDemoStage.parentNode !== demoStageOriginalParent) {
                demoStageOriginalParent.insertBefore(projectDemoStage, demoStageOriginalNext);
            }

            const masonry = projectMasonry && projectMasonry.getMasonry && projectMasonry.getMasonry();
            if (wasInProjectList && masonry) {
                masonry.reloadItems();
                masonry.layout();
            }
        }

        function closeProjectDemo() {
            if (demoResizeObserver) {
                demoResizeObserver.disconnect();
                demoResizeObserver = null;
            }

            const activeMedia = projectDemoBody.querySelector("video");

            if (activeMedia) {
                activeMedia.pause();
                activeMedia.removeAttribute("src");
                activeMedia.load();
            }

            projectDemoBody.innerHTML = "";
            projectDemoStage.classList.remove("is-open");
            projectDemoStage.hidden = true;
            returnDemoStageHome();
            activeDemoTarget = null;

            demoTriggers.forEach((trigger) => {
                trigger.classList.remove("is-active");
                trigger.setAttribute("aria-expanded", "false");
            });
        }

        function centerProjectDemo() {
            if (projectDemoStage.hidden) {
                return;
            }

            const media = projectDemoBody.querySelector("video, img") || projectDemoStage;

            window.setTimeout(() => {
                media.scrollIntoView({
                    block: "center",
                    inline: "nearest",
                    behavior: prefersReducedMotion() ? "auto" : "smooth"
                });
            }, 460);
        }

        function openProjectDemo(trigger) {
            if (activeDemoTarget === trigger.getAttribute("data-demo-target")) {
                closeProjectDemo();
                return;
            }

            closeProjectDemo();

            const demoKind = trigger.getAttribute("data-demo-kind");
            const demoSrc = trigger.getAttribute("data-demo-src");
            const hostProject = trigger.closest(".project-item");

            if (!demoSrc || !hostProject) {
                return;
            }

            const projectList = hostProject.closest(".project-list");
            if (projectList) {
                placeDemoStageAfterRow(projectList, hostProject);
            } else {
                hostProject.appendChild(projectDemoStage);
            }

            if (demoKind === "video") {
                const media = document.createElement("video");
                const playPromise = (() => {
                    media.controls = true;
                    media.muted = true;
                    media.loop = true;
                    media.playsInline = true;
                    media.preload = "metadata";
                    media.className = "project-demo-media";
                    media.src = demoSrc;
                    media.addEventListener("loadedmetadata", () => {
                        refreshProjectMasonry();
                        centerProjectDemo();
                    }, { once: true });
                    projectDemoBody.appendChild(media);
                    return media.play();
                })();

                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => {
                        /* autoplay can be blocked by the browser */
                    });
                }
            } else {
                const media = document.createElement("img");
                media.className = "project-demo-media";
                media.src = demoSrc;
                media.alt = "Project demo";
                media.loading = "lazy";

                if (media.complete) {
                    window.requestAnimationFrame(() => {
                        refreshProjectMasonry();
                        centerProjectDemo();
                    });
                } else {
                    media.addEventListener("load", () => {
                        refreshProjectMasonry();
                        centerProjectDemo();
                    }, { once: true });
                }

                projectDemoBody.appendChild(media);
            }

            projectDemoStage.hidden = false;
            window.requestAnimationFrame(() => {
                projectDemoStage.classList.add("is-open");
                refreshProjectMasonry();
                window.requestAnimationFrame(centerProjectDemo);
            });

            trigger.classList.add("is-active");
            trigger.setAttribute("aria-expanded", "true");
            activeDemoTarget = trigger.getAttribute("data-demo-target");

            window.setTimeout(() => {
                const focusTarget = projectDemoBody.querySelector("video, img");

                if (focusTarget && typeof focusTarget.focus === "function") {
                    focusTarget.setAttribute("tabindex", "-1");
                    focusTarget.focus({ preventScroll: true });
                }
            }, 220);
        }

        demoTriggers.forEach((trigger) => {
            trigger.setAttribute("aria-expanded", "false");
            trigger.addEventListener("click", () => {
                openProjectDemo(trigger);
            });
        });

        if (projectDemoClose) {
            projectDemoClose.addEventListener("click", closeProjectDemo);
        }

        projectDemoStage.addEventListener("transitionend", (event) => {
            if (event.propertyName === "max-height" || event.propertyName === "padding-bottom") {
                refreshProjectMasonry();
            }
        });

        return {
            closeProjectDemo: closeProjectDemo,
            isOpen: () => projectDemoStage.classList.contains("is-open")
        };
    }

    function initLightbox() {
        const lightbox = document.getElementById("image-lightbox");
        const lightboxImage = document.getElementById("lightbox-image");
        const lightboxClose = document.getElementById("lightbox-close");
        const imageLinks = toArray(document.querySelectorAll(".art-image-link"));

        if (!lightbox || !lightboxImage) {
            return {
                closeLightbox: () => {},
                isOpen: () => false
            };
        }

        function closeLightbox() {
            lightbox.classList.remove("is-open");
            lightbox.setAttribute("aria-hidden", "true");
            lightboxImage.removeAttribute("src");
            lightboxImage.setAttribute("alt", "");
            document.body.style.overflow = "";
        }

        imageLinks.forEach((link) => {
            link.addEventListener("click", (event) => {
                const image = link.querySelector("img");

                event.preventDefault();
                lightboxImage.setAttribute("src", link.getAttribute("href"));
                lightboxImage.setAttribute("alt", image ? image.getAttribute("alt") : "Expanded artwork");
                lightbox.classList.add("is-open");
                lightbox.setAttribute("aria-hidden", "false");
                document.body.style.overflow = "hidden";
            });
        });

        lightbox.addEventListener("click", (event) => {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        if (lightboxClose) {
            lightboxClose.addEventListener("click", closeLightbox);
        }

        return {
            closeLightbox: closeLightbox,
            isOpen: () => lightbox.classList.contains("is-open")
        };
    }

    function initEscapeHandling(features) {
        siteState.currentFeatures = features;

        if (siteState.escapeBound) {
            return;
        }

        document.addEventListener("keydown", (event) => {
            const currentFeatures = siteState.currentFeatures;

            if (event.key !== "Escape") {
                return;
            }

            if (currentFeatures.lightbox.isOpen()) {
                currentFeatures.lightbox.closeLightbox();
                return;
            }

            if (currentFeatures.projectDemos.isOpen()) {
                currentFeatures.projectDemos.closeProjectDemo();
            }
        });
        siteState.escapeBound = true;
    }

    function initReveals() {
        const selectors = [
            ".hero-title",
            ".hero-sub",
            ".hero .divider",
            ".prose-section .section-title",
            ".prose > *",
            ".section-head",
            ".project-item",
            ".learning-grid > *",
            ".music-col > *",
            ".music-grid > .quiet-card",
            ".page-head",
            ".page-section .section-head",
            ".blog-card",
            ".art-card",
            ".site-footer",
            ".foot"
        ];
        const elements = toArray(document.querySelectorAll(selectors.join(",")))
            .filter((element) => !element.classList.contains("reveal-item"));

        if (elements.length === 0) {
            return;
        }

        elements.forEach((element, index) => {
            element.classList.add("reveal-item");
            element.style.setProperty("--reveal-delay", Math.min(index % 6, 5) * 45 + "ms");
        });

        if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
            elements.forEach((element) => {
                element.classList.add("is-visible");
            });
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, {
            rootMargin: "0px 0px -10% 0px",
            threshold: 0.12
        });

        elements.forEach((element) => {
            observer.observe(element);
        });
    }

    function initPageFeatures() {
        initFooterYear();
        safeInit(initTopbar);
        safeInit(initTheme);

        const projectMasonry = safeInit(initProjectMasonry, {
            refresh: () => {},
            getMasonry: () => null
        });
        const projectDemos = safeInit(() => initProjectDemos(projectMasonry), {
            closeProjectDemo: () => {},
            isOpen: () => false
        });
        const lightbox = safeInit(initLightbox, {
            closeLightbox: () => {},
            isOpen: () => false
        });

        safeInit(initDresdenPhoto);
        safeInit(initPlaylists);
        safeInit(initReveals);
        safeInit(() => initEscapeHandling({
            projectDemos: projectDemos,
            lightbox: lightbox
        }));
    }

    function getPersistentBodyNodes() {
        const nodeIds = ["player-bar", "sc-widget-iframe-1", "sc-widget-iframe-2"];

        return nodeIds.map((id) => document.getElementById(id)).filter(Boolean);
    }

    function updateDocumentMetadata(nextDocument) {
        const nextDescription = nextDocument.querySelector('meta[name="description"]');
        const currentDescription = document.querySelector('meta[name="description"]');

        if (nextDocument.title) {
            document.title = nextDocument.title;
        }

        if (currentDescription && nextDescription) {
            currentDescription.setAttribute("content", nextDescription.getAttribute("content") || "");
        }
    }

    function copyBodyAttributes(nextBody) {
        const playerOpen = document.body.classList.contains("player-open");
        const currentTheme = document.documentElement.getAttribute("data-theme") ||
            document.body.getAttribute("data-theme") ||
            DEFAULT_THEME;

        toArray(document.body.attributes).forEach((attribute) => {
            document.body.removeAttribute(attribute.name);
        });
        toArray(nextBody.attributes).forEach((attribute) => {
            document.body.setAttribute(attribute.name, attribute.value);
        });

        document.body.setAttribute("data-theme", currentTheme);
        document.body.classList.remove("is-ready");
        document.body.classList.add("is-transitioning");

        if (playerOpen) {
            document.body.classList.add("player-open");
        }
    }

    function buildBodyFragment(nextBody) {
        const fragment = document.createDocumentFragment();

        toArray(nextBody.childNodes).forEach((node) => {
            if (node.nodeType === 1 && node.tagName === "SCRIPT") {
                return;
            }

            fragment.appendChild(node.cloneNode(true));
        });

        return fragment;
    }

    function loadScript(src) {
        if (!src || siteState.loadedScriptUrls.has(src)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src = src;
            script.async = false;
            script.onload = () => {
                siteState.loadedScriptUrls.add(src);
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    function loadRequiredScripts(nextDocument, targetUrl) {
        const scriptUrls = toArray(nextDocument.querySelectorAll("script[src]"))
            .map((script) => script.getAttribute("src"))
            .filter(Boolean)
            .map((src) => new URL(src, targetUrl).href)
            .filter((src) => src !== SOUNDCLOUD_API_SRC);

        return Promise.all(scriptUrls.map((src) => loadScript(src)));
    }

    function teardownPageFeatures() {
        if (siteState.currentFeatures.lightbox && siteState.currentFeatures.lightbox.isOpen()) {
            siteState.currentFeatures.lightbox.closeLightbox();
        }

        if (siteState.currentFeatures.projectDemos && siteState.currentFeatures.projectDemos.isOpen()) {
            siteState.currentFeatures.projectDemos.closeProjectDemo();
        }

        document.body.style.overflow = "";
    }

    function applyFetchedPage(nextDocument) {
        const nextBody = nextDocument.body;
        const persistentNodes = getPersistentBodyNodes();
        const anchorNode = persistentNodes[0] || null;

        copyBodyAttributes(nextBody);

        toArray(document.body.childNodes).forEach((node) => {
            if (persistentNodes.indexOf(node) === -1) {
                node.remove();
            }
        });

        if (anchorNode && anchorNode.parentNode === document.body) {
            document.body.insertBefore(buildBodyFragment(nextBody), anchorNode);
        } else {
            document.body.appendChild(buildBodyFragment(nextBody));
        }

        persistentNodes.forEach((node) => {
            if (node.parentNode !== document.body) {
                document.body.appendChild(node);
            }
        });
    }

    function scrollAfterNavigation(targetUrl) {
        if (targetUrl.hash) {
            const target = document.getElementById(targetUrl.hash.slice(1));

            if (target) {
                target.scrollIntoView();
                return;
            }
        }

        window.scrollTo(0, 0);
    }

    function navigateToPage(target, options) {
        const targetUrl = new URL(target, window.location.href);
        const navigationToken = ++siteState.navigationToken;

        teardownPageFeatures();

        return window.fetch(targetUrl.href, {
            credentials: "same-origin"
        }).then((response) => {
            if (!response.ok) {
                throw new Error("Navigation request failed");
            }

            return response.text();
        }).then((html) => {
            if (navigationToken !== siteState.navigationToken) {
                return;
            }

            const parser = new DOMParser();
            const nextDocument = parser.parseFromString(html, "text/html");

            if (!nextDocument.body) {
                throw new Error("Missing body in fetched page");
            }

            if (!options || options.history !== "ignore") {
                const historyMethod = options && options.history === "replace" ? "replaceState" : "pushState";
                window.history[historyMethod]({}, "", targetUrl.href);
            }

            document.documentElement.lang = nextDocument.documentElement.lang || document.documentElement.lang;
            updateDocumentMetadata(nextDocument);
            applyFetchedPage(nextDocument);

            return loadRequiredScripts(nextDocument, targetUrl.href).catch(() => {}).then(() => {
                initPageTransitions();
                initPageFeatures();
                scrollAfterNavigation(targetUrl);
            });
        }).catch(() => {
            window.location.href = targetUrl.href;
        });
    }

    function shouldHandleClientNavigation(link, event) {
        const href = link.getAttribute("href") || "";
        const targetUrl = new URL(link.href, window.location.href);

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return false;
        }

        if (!href || href.charAt(0) === "#" || link.hasAttribute("download") || link.getAttribute("target")) {
            return false;
        }

        if (targetUrl.origin !== window.location.origin) {
            return false;
        }

        if (/^(mailto|tel|javascript):/i.test(href)) {
            return false;
        }

        if (/\.(pdf|png|jpe?g|gif|webp|svg|heic|mp4)$/i.test(targetUrl.pathname)) {
            return false;
        }

        if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search && targetUrl.hash) {
            return false;
        }

        return true;
    }

    function initClientNavigation() {
        if (siteState.clientNavigationBound) {
            return;
        }

        document.addEventListener("click", (event) => {
            const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;

            if (!link || !shouldHandleClientNavigation(link, event)) {
                return;
            }

            event.preventDefault();
            navigateToPage(link.href);
        });

        window.addEventListener("popstate", () => {
            navigateToPage(window.location.href, {
                history: "ignore"
            });
        });

        siteState.clientNavigationBound = true;
    }

    function initSite() {
        initPageTransitions();
        initPageFeatures();
        initClientNavigation();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSite, { once: true });
    } else {
        initSite();
    }
})();
