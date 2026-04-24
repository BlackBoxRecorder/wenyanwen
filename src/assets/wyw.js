/* wenyanwen 客户端交互脚本 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    var article = document.querySelector(".wyw");
    if (!article) return;

    restorePreferences(article);
    bindTranslationToggle(article);
    bindFontSizeToggle(article);
    bindThemeToggle();
    bindTooltipPositioning(article);
    bindKeyboardShortcuts(article);
  }

  // === 偏好恢复 ===
  function restorePreferences(article) {
    // 译文显示状态
    var showTrans = localStorage.getItem("wyw-show-translation");
    if (showTrans === "false") {
      article.classList.add("wyw--hide-translation");
      var btn = article.querySelector(".wyw-btn--translation");
      if (btn) btn.setAttribute("aria-pressed", "false");
    }

    // 字体大小
    var savedFontSize = localStorage.getItem("wyw-font-size");
    if (savedFontSize && savedFontSize !== "standard") {
      var fontClass =
        savedFontSize === "medium" ? "wyw--font-md" : "wyw--font-lg";
      article.classList.add(fontClass);
      updateFontSizeButton(savedFontSize);
    }

    // 主题
    var savedTheme = localStorage.getItem("wyw-theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
      updateThemeButton(savedTheme);
    }
  }

  // === 译文切换 ===
  function bindTranslationToggle(article) {
    var btn = article.querySelector(".wyw-btn--translation");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var isHidden = article.classList.toggle("wyw--hide-translation");
      btn.setAttribute("aria-pressed", isHidden ? "false" : "true");
      localStorage.setItem("wyw-show-translation", isHidden ? "false" : "true");
    });
  }

  // === 字号切换 ===
  var fontSizes = ["standard", "medium", "large"];

  function bindFontSizeToggle(article) {
    var btn = article.querySelector(".wyw-btn--fontsize");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var current = getCurrentFontSize(article);
      var idx = fontSizes.indexOf(current);
      var next = fontSizes[(idx + 1) % fontSizes.length];

      applyFontSize(article, next);
      localStorage.setItem("wyw-font-size", next);
      updateFontSizeButton(next);
    });
  }

  function getCurrentFontSize(article) {
    if (article.classList.contains("wyw--font-lg")) return "large";
    if (article.classList.contains("wyw--font-md")) return "medium";
    return "standard";
  }

  function applyFontSize(article, size) {
    article.classList.remove("wyw--font-md", "wyw--font-lg");
    if (size === "medium") article.classList.add("wyw--font-md");
    if (size === "large") article.classList.add("wyw--font-lg");
  }

  function updateFontSizeButton(size) {
    var btn = document.querySelector(".wyw-btn--fontsize");
    if (!btn) return;

    var labels = { standard: "字", medium: "中", large: "大" };
    var titles = { standard: "标准字号", medium: "中字号", large: "大字号" };
    btn.textContent = labels[size] || "字";
    btn.title = titles[size] || "字体大小";
  }

  // === 主题切换 ===
  function bindThemeToggle() {
    var btn = document.querySelector(".wyw-btn--theme");
    if (!btn) return;

    var themes = ["auto", "light", "dark"];

    btn.addEventListener("click", function () {
      var current =
        document.documentElement.getAttribute("data-theme") || "auto";
      var idx = themes.indexOf(current);
      var next = themes[(idx + 1) % themes.length];

      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("wyw-theme", next);
      updateThemeButton(next);
    });
  }

  function updateThemeButton(theme) {
    var btn = document.querySelector(".wyw-btn--theme");
    if (!btn) return;

    var labels = { auto: "自", light: "日", dark: "月" };
    btn.textContent = labels[theme] || "自";
    btn.title =
      { auto: "跟随系统", light: "浅色模式", dark: "深色模式" }[theme] ||
      "切换主题";
  }

  // === Tooltip 边界检测 ===
  function bindTooltipPositioning(article) {
    article.addEventListener(
      "mouseenter",
      function (e) {
        var target = e.target;
        if (!target.classList || !target.classList.contains("wyw-annotate"))
          return;
        adjustTooltip(target);
      },
      true,
    );

    article.addEventListener("focusin", function (e) {
      var target = e.target;
      if (!target.classList || !target.classList.contains("wyw-annotate"))
        return;
      adjustTooltip(target);
    });
  }

  function adjustTooltip(el) {
    var rect = el.getBoundingClientRect();
    var viewportWidth = window.innerWidth;
    var centerX = rect.left + rect.width / 2;

    // 估算 tooltip 宽度（粗略按字符数 * 14px + padding）
    var note = el.getAttribute("data-note") || "";
    var estWidth = Math.min(note.length * 14 + 24, 280);
    var halfWidth = estWidth / 2;

    if (centerX - halfWidth < 8) {
      el.setAttribute("data-tooltip-align", "left");
    } else if (centerX + halfWidth > viewportWidth - 8) {
      el.setAttribute("data-tooltip-align", "right");
    } else {
      el.removeAttribute("data-tooltip-align");
    }
  }

  // === 键盘快捷键 ===
  function bindKeyboardShortcuts(article) {
    document.addEventListener("keydown", function (e) {
      // 在输入框中不响应
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "t" || e.key === "T") {
        var btn = article.querySelector(".wyw-btn--translation");
        if (btn) btn.click();
      }

      if (e.key === "d" || e.key === "D") {
        var themeBtn = document.querySelector(".wyw-btn--theme");
        if (themeBtn) themeBtn.click();
      }

      if (e.key === "f" || e.key === "F") {
        var fontBtn = article.querySelector(".wyw-btn--fontsize");
        if (fontBtn) fontBtn.click();
      }
    });
  }
})();
