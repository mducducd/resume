(() => {
    const DEFAULT_THEME = "light";
    const DAILY_ART_STORAGE_KEY = "daily-museum-artwork-v1";
    const PLAYLISTS = {
        1: {
            iframeId: "sc-widget-iframe-1",
            listId: "track-list-1",
            loadingId: "track-loading-1",
            tracks: [],
            currentTrackIndex: -1,
            widget: null
        },
        2: {
            iframeId: "sc-widget-iframe-2",
            listId: "track-list-2",
            loadingId: "track-loading-2",
            tracks: [],
            currentTrackIndex: -1,
            widget: null
        }
    };

    function toArray(value) {
        return Array.from(value || []);
    }

    function getHashTarget(href) {
        if (!href || href.charAt(0) !== "#") {
            return null;
        }

        return href.replace(/^#/, "");
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function hashString(value) {
        let hash = 0;

        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(index);
            hash |= 0;
        }

        return Math.abs(hash);
    }

    function getLocalDateKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");

        return year + "-" + month + "-" + day;
    }

    function pickSeeded(list, seed) {
        if (!list || list.length === 0) {
            return null;
        }

        return list[seed % list.length];
    }

    function fetchJson(url) {
        return window.fetch(url, { mode: "cors" }).then((response) => {
            if (!response.ok) {
                throw new Error("Request failed");
            }

            return response.json();
        });
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
            document.body.setAttribute("data-theme", theme);

            if (!themeToggle) {
                return;
            }

            themeToggle.querySelector(".theme-toggle-label").textContent = theme === "dark" ? "Light" : "Dark";
            themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
            themeToggle.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
        }

        if (themeToggle) {
            themeToggle.addEventListener("click", () => {
                const currentTheme = document.body.getAttribute("data-theme");
                const nextTheme = currentTheme === "dark" ? "light" : "dark";
                applyTheme(nextTheme);
            });
        }

        applyTheme(DEFAULT_THEME);
    }

    function initNavigation() {
        const trackedNavLinks = toArray(document.querySelectorAll(".top-nav a, .sidebar-links a"));
        const viewLinks = toArray(document.querySelectorAll("[data-view-target]"));
        const backLinks = toArray(document.querySelectorAll("[data-view-close]"));
        const sections = toArray(document.querySelectorAll("main > section[id].hero, main > section[id].page-section"));
        const fullpageViews = toArray(document.querySelectorAll(".fullpage-view"));
        const mainColumn = document.querySelector(".main-column");
        let previousSectionId = "about";

        function getLinkTarget(link) {
            return link.getAttribute("data-view-target") || getHashTarget(link.getAttribute("href") || "");
        }

        function setActiveNav(sectionId) {
            trackedNavLinks.forEach((link) => {
                const target = getLinkTarget(link);

                if (!target) {
                    return;
                }

                link.classList.toggle("active", target === sectionId);

                if (target === sectionId) {
                    link.setAttribute("aria-current", "page");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        function updateActiveNavFromScroll() {
            if (!mainColumn || mainColumn.classList.contains("view-mode") || sections.length === 0) {
                return;
            }

            const navOffset = 96;
            let bestSection = null;
            let bestDistance = Infinity;

            sections.forEach((section) => {
                const rect = section.getBoundingClientRect();
                const distance = Math.abs(rect.top - navOffset);

                if (rect.top <= navOffset && distance < bestDistance) {
                    bestDistance = distance;
                    bestSection = section;
                }
            });

            if (!bestSection) {
                bestSection = sections[0];
            }

            if (bestSection) {
                previousSectionId = bestSection.id;
                setActiveNav(bestSection.id);
            }
        }

        function openView(viewId) {
            const targetView = document.getElementById(viewId);

            if (!mainColumn || !targetView) {
                return;
            }

            fullpageViews.forEach((view) => {
                view.classList.toggle("active", view === targetView);
            });

            mainColumn.classList.add("view-mode");
            setActiveNav(viewId);
            window.scrollTo({ top: 0, behavior: "auto" });
        }

        function closeView() {
            if (!mainColumn) {
                return;
            }

            fullpageViews.forEach((view) => {
                view.classList.remove("active");
            });

            mainColumn.classList.remove("view-mode");
            setActiveNav(previousSectionId || "about");
        }

        trackedNavLinks.forEach((link) => {
            const targetId = getHashTarget(link.getAttribute("href") || "");

            if (link.hasAttribute("data-view-target") || !targetId) {
                return;
            }

            link.addEventListener("click", (event) => {
                const targetSection = document.getElementById(targetId);

                if (!targetSection) {
                    return;
                }

                event.preventDefault();

                if (mainColumn && mainColumn.classList.contains("view-mode")) {
                    closeView();
                }

                setActiveNav(targetId);
                previousSectionId = targetId;
                targetSection.scrollIntoView({ block: "start", behavior: "auto" });
                link.blur();
            });
        });

        viewLinks.forEach((link) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                openView(link.getAttribute("data-view-target"));
                link.blur();
            });
        });

        backLinks.forEach((link) => {
            link.addEventListener("click", (event) => {
                const previousSection = document.getElementById(previousSectionId || "about");

                event.preventDefault();
                closeView();

                if (previousSection) {
                    previousSection.scrollIntoView({ block: "start", behavior: "auto" });
                }
            });
        });

        if (sections.length > 0) {
            if ("IntersectionObserver" in window) {
                const observer = new IntersectionObserver(() => {
                    updateActiveNavFromScroll();
                }, {
                    rootMargin: "-12% 0px -70% 0px",
                    threshold: [0, 0.2, 0.5, 1]
                });

                sections.forEach((section) => {
                    observer.observe(section);
                });
            } else {
                window.addEventListener("scroll", updateActiveNavFromScroll, { passive: true });
            }

            window.addEventListener("resize", updateActiveNavFromScroll);
            updateActiveNavFromScroll();
        }

        return {
            closeView: closeView,
            isViewMode: () => Boolean(mainColumn && mainColumn.classList.contains("view-mode"))
        };
    }

    function initDailyArtwork() {
        const dailySlot = {
            link: document.getElementById("daily-art-link"),
            image: document.getElementById("daily-art-image"),
            label: document.getElementById("daily-art-label"),
            title: document.getElementById("daily-art-title"),
            credit: document.getElementById("daily-art-credit")
        };
        const gallerySlot = {
            link: document.getElementById("gallery-art-link"),
            image: document.getElementById("gallery-art-image"),
            label: document.getElementById("gallery-art-label"),
            title: document.getElementById("gallery-art-title"),
            credit: document.getElementById("gallery-art-credit")
        };
        const slots = [dailySlot, gallerySlot];

        function applyArtworkToSlot(slot, artwork) {
            if (!slot.link || !slot.image || !slot.label || !slot.title || !slot.credit || !artwork) {
                return;
            }

            slot.link.href = artwork.link;
            slot.link.classList.add("is-ready");
            slot.image.src = artwork.image;
            slot.image.alt = artwork.title;
            slot.label.textContent = artwork.label;
            slot.title.textContent = artwork.title;
            slot.credit.textContent = artwork.credit;
        }

        function applyDailyArtwork(artwork) {
            slots.forEach((slot) => {
                applyArtworkToSlot(slot, artwork);
            });
        }

        function setDailyArtworkFallback() {
            slots.forEach((slot) => {
                if (!slot.link || !slot.image || !slot.label || !slot.title || !slot.credit) {
                    return;
                }

                slot.link.href = "https://www.metmuseum.org/art/collection";
                slot.link.classList.remove("is-ready");
                slot.image.removeAttribute("src");
                slot.image.alt = "";
                slot.label.textContent = "Daily museum pick";
                slot.title.textContent = "Selected Works";
                slot.credit.textContent = "A rotating daily artwork from paintings, drawings, and prints at The Met.";
            });
        }

        function getDailyArtworkCache() {
            try {
                return JSON.parse(window.localStorage.getItem(DAILY_ART_STORAGE_KEY) || "null");
            } catch (error) {
                return null;
            }
        }

        function saveDailyArtworkCache(payload) {
            try {
                window.localStorage.setItem(DAILY_ART_STORAGE_KEY, JSON.stringify(payload));
            } catch (error) {
                /* ignore storage failures */
            }
        }

        if (!slots.some((slot) => slot.link && slot.image && slot.label && slot.title && slot.credit)) {
            return;
        }

        const todayKey = getLocalDateKey();
        const cache = getDailyArtworkCache();
        const presets = [
            {
                label: "Daily painting",
                searchUrl: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&medium=Paintings&q=painting"
            },
            {
                label: "Daily drawing",
                searchUrl: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=Drawings&q=drawing"
            },
            {
                label: "Daily print",
                searchUrl: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=Prints&q=print"
            }
        ];
        const seed = hashString(todayKey);
        const preset = pickSeeded(presets, seed);

        if (cache && cache.date === todayKey && cache.artwork) {
            applyDailyArtwork(cache.artwork);
            return;
        }

        setDailyArtworkFallback();

        fetchJson(preset.searchUrl)
            .then((searchData) => {
                const objectIds = (searchData && searchData.objectIDs) || [];
                const objectId = pickSeeded(objectIds.slice(0, 120), seed);

                if (!objectId) {
                    throw new Error("No objects found");
                }

                return fetchJson("https://collectionapi.metmuseum.org/public/collection/v1/objects/" + objectId);
            })
            .then((objectData) => {
                const title = objectData.title || "Untitled";
                const artist = objectData.artistDisplayName || objectData.culture || "Unknown maker";
                const date = objectData.objectDate || "";
                const image = objectData.primaryImageSmall || objectData.primaryImage || "";
                const link = objectData.objectURL || "https://www.metmuseum.org/art/collection";

                if (!image) {
                    throw new Error("Missing artwork image");
                }

                const artwork = {
                    label: preset.label,
                    title: title,
                    credit: artist + (date ? ", " + date : ""),
                    image: image,
                    link: link
                };

                saveDailyArtworkCache({
                    date: todayKey,
                    artwork: artwork
                });

                applyDailyArtwork(artwork);
            })
            .catch(() => {
                setDailyArtworkFallback();
            });
    }

    function initDresdenPhoto() {
        const aboutGrid = document.getElementById("about-grid");
        const aboutPhotoCard = document.getElementById("about-photo-card");
        const dresdenPhoto = document.getElementById("dresden-photo");

        if (!dresdenPhoto) {
            return;
        }

        function setAboutPhotoReady(isReady) {
            if (aboutGrid) {
                aboutGrid.classList.toggle("is-photo-ready", Boolean(isReady));
            }

            if (aboutPhotoCard) {
                aboutPhotoCard.setAttribute("aria-hidden", isReady ? "false" : "true");
            }
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

        function applyDresdenPhoto(photo) {
            if (!photo || !photo.image) {
                return Promise.reject(new Error("Missing Dresden photo"));
            }

            return preloadImage(photo.image).then((image) => {
                const aspectRatio = image && image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 0;

                if (!isAcceptedDresdenAspectRatio(aspectRatio)) {
                    throw new Error("Rejected wide Dresden photo");
                }

                dresdenPhoto.src = photo.image;
                dresdenPhoto.alt = photo.alt || "Daily landscape view from Germany";
                if (dresdenCaption && photo.caption) {
                    dresdenCaption.textContent = "Germany, today · " + photo.caption;
                }
                setAboutPhotoReady(true);
                markFigureLoaded();
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
        const fallbackPhoto = {
            image: dresdenPhoto.getAttribute("src"),
            alt: dresdenPhoto.getAttribute("alt") || "Daily landscape view from Germany"
        };

        Promise.all(searchUrls.map((url) => fetchJson(url).catch(() => null)))
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
                /* keep the running-cat loader visible if the photo fetch fails */
            });
    }

    function initPlaylists() {
        const playlistToggles = toArray(document.querySelectorAll("[data-playlist-toggle]"));
        const playerBar = document.getElementById("player-bar");
        const playerIframe = document.getElementById("sc-player");
        const playerClose = document.getElementById("player-close");
        let playerWidget = null;
        let activePlaylistIndex = null;

        function setPlaylistOpen(index, open) {
            const toggle = document.getElementById("playlist-toggle-" + index);
            const list = document.getElementById("track-list-" + index);

            if (!toggle || !list) {
                return;
            }

            toggle.setAttribute("aria-expanded", open ? "true" : "false");
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
            if (playerWidget) {
                try {
                    playerWidget.unbind(SC.Widget.Events.FINISH);
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
            activePlaylistIndex = null;
            playerWidget = null;

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

            playlist.tracks = sounds;
            sounds.forEach((sound, soundIndex) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "track-item";
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

        function initializePlaylist(index) {
            const playlist = PLAYLISTS[index];

            if (!playlist || !window.SC || !SC.Widget) {
                return;
            }

            playlist.widget = SC.Widget(document.getElementById(playlist.iframeId));
            playlist.widget.bind(SC.Widget.Events.READY, () => {
                playlist.widget.getSounds((sounds) => {
                    renderPlaylist(index, sounds || []);
                });
            });
        }

        function playNextTrack() {
            if (activePlaylistIndex === null) {
                return;
            }

            const playlist = PLAYLISTS[activePlaylistIndex];

            if (!playlist || playlist.tracks.length === 0) {
                return;
            }

            const nextIndex = (playlist.currentTrackIndex + 1) % playlist.tracks.length;
            const items = document.querySelectorAll("#track-list-" + activePlaylistIndex + " .track-item");

            if (items[nextIndex]) {
                playTrack(items[nextIndex], activePlaylistIndex, nextIndex);
            }
        }

        function bindPlayerFinish() {
            if (!window.SC || !SC.Widget || !playerIframe || !playerIframe.getAttribute("src")) {
                return;
            }

            if (playerWidget) {
                try {
                    playerWidget.unbind(SC.Widget.Events.FINISH);
                } catch (error) {
                    /* ignore stale widget instances */
                }
            }

            playerWidget = SC.Widget(playerIframe);
            playerWidget.bind(SC.Widget.Events.FINISH, () => {
                playNextTrack();
            });
        }

        function playTrack(element, playlistIndex, trackIndex) {
            const playlist = PLAYLISTS[playlistIndex];

            if (!playlist || !playlist.tracks[trackIndex] || !playerIframe) {
                return;
            }

            activePlaylistIndex = playlistIndex;
            playlist.currentTrackIndex = trackIndex;

            toArray(document.querySelectorAll(".track-item")).forEach((item) => {
                item.classList.remove("playing");
            });

            element.classList.add("playing");

            const src = "https://w.soundcloud.com/player/?url=" +
                encodeURIComponent(playlist.tracks[trackIndex].permalink_url) +
                "&color=%2385906f&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false";

            if (playerBar) {
                playerBar.classList.add("visible");
            }

            document.body.classList.add("player-open");
            playerIframe.onload = bindPlayerFinish;
            playerIframe.src = src;
        }

        playlistToggles.forEach((toggle) => {
            toggle.addEventListener("click", () => {
                togglePlaylist(toggle.getAttribute("data-playlist-toggle"));
            });
        });

        if (playerClose) {
            playerClose.addEventListener("click", closePlayer);
        }

        if (window.SC && SC.Widget) {
            initializePlaylist(1);
            initializePlaylist(2);
        }

        setPlaylistOpen(1, true);
        setPlaylistOpen(2, false);

        return {
            closePlayer: closePlayer
        };
    }

    function initProjectDemos() {
        const demoTriggers = toArray(document.querySelectorAll(".demo-trigger"));
        const projectDemoStage = document.getElementById("project-demo-stage");
        const projectDemoBody = document.getElementById("project-demo-body");
        const projectDemoClose = document.getElementById("project-demo-close");
        let activeDemoTarget = null;

        if (!projectDemoStage || !projectDemoBody || demoTriggers.length === 0) {
            return {
                closeProjectDemo: () => {},
                isOpen: () => false
            };
        }

        function closeProjectDemo() {
            const activeMedia = projectDemoBody.querySelector("video");

            if (activeMedia) {
                activeMedia.pause();
                activeMedia.removeAttribute("src");
                activeMedia.load();
            }

            projectDemoBody.innerHTML = "";
            projectDemoStage.classList.remove("is-open");
            projectDemoStage.hidden = true;
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
                    behavior: "smooth"
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

            hostProject.appendChild(projectDemoStage);

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
                    media.addEventListener("loadedmetadata", centerProjectDemo, { once: true });
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
                    window.requestAnimationFrame(centerProjectDemo);
                } else {
                    media.addEventListener("load", centerProjectDemo, { once: true });
                }

                projectDemoBody.appendChild(media);
            }

            projectDemoStage.hidden = false;
            window.requestAnimationFrame(() => {
                projectDemoStage.classList.add("is-open");
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
        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") {
                return;
            }

            if (features.lightbox.isOpen()) {
                features.lightbox.closeLightbox();
                return;
            }

            if (features.projectDemos.isOpen()) {
                features.projectDemos.closeProjectDemo();
                return;
            }

            if (features.navigation.isViewMode()) {
                features.navigation.closeView();
            }
        });
    }

    function initSite() {
        initTheme();

        const navigation = initNavigation();
        const projectDemos = initProjectDemos();
        const lightbox = initLightbox();

        initDresdenPhoto();
        initDailyArtwork();
        initPlaylists();
        initEscapeHandling({
            navigation: navigation,
            projectDemos: projectDemos,
            lightbox: lightbox
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSite, { once: true });
    } else {
        initSite();
    }
})();
