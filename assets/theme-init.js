(() => {
    try {
        const savedTheme = window.localStorage.getItem("portfolio-theme");

        if (savedTheme === "light" || savedTheme === "dark") {
            document.documentElement.setAttribute("data-theme", savedTheme);
        }
    } catch (error) {
        /* ignore storage failures */
    }
})();
