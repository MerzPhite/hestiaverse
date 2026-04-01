const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("related", function (articles, current) {
    if (!Array.isArray(articles) || !current) return [];

    const currentLabels = new Set((current.labels || []).map((l) => String(l).toLowerCase()));
    const currentPlatforms = new Set(
      (current.platformTags || []).map((t) => String(t).toLowerCase())
    );
    const currentSection = String(current.section || "").toLowerCase();
    const currentSeverity = String(current.severity || "").toLowerCase();

    const toTs = (v) => {
      if (!v) return Number.NaN;
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : Number.NaN;
    };

    return articles
      .filter((a) => a && a.slug !== current.slug)
      .map((a, idx) => {
        const labels = (a.labels || []).map((l) => String(l).toLowerCase());
        const platforms = (a.platformTags || []).map((t) => String(t).toLowerCase());
        const section = String(a.section || "").toLowerCase();
        const severity = String(a.severity || "").toLowerCase();

        const sharedLabels = labels.filter((l) => currentLabels.has(l)).length;
        const sharedPlatforms = platforms.filter((t) => currentPlatforms.has(t)).length;
        const sameSection = section && currentSection && section === currentSection ? 1 : 0;
        const sameSeverity = severity && currentSeverity && severity === currentSeverity ? 1 : 0;

        // Prefer strong topic overlap, then platform overlap, then section alignment.
        let score = 0;
        score += sharedLabels * 8;
        score += sharedPlatforms * 10;
        score += sameSection * 6;
        score += sameSeverity * 2;

        // Small recency boost for newer entries.
        const ts = toTs(a.createdAt || a.published);
        if (Number.isFinite(ts)) {
          const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
          if (days <= 30) score += 2;
          else if (days <= 90) score += 1;
        }

        return {
          a,
          idx,
          score,
          sharedLabels,
          sharedPlatforms,
        };
      })
      .filter((x) => x.score > 0 && (x.sharedLabels > 0 || x.sharedPlatforms > 0))
      .sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score;
        // If scores tie, prefer items appearing later in articles.js.
        return y.idx - x.idx;
      })
      .slice(0, 5)
      .map((x) => x.a);
  });

  eleventyConfig.addFilter("where", function (arr, key, val) {
    return (arr || []).filter((item) => item[key] === val);
  });

  /**
   * Home page sections: sort by `published` (ISO `YYYY-MM-DD`) when set, else by order in
   * `_data/articles.js` (later in the file = newer). Newest first.
   */
  /** Newest first: createdAt, then published, then position in master list. */
  function articleRecencyRank(a, master) {
    const indexOf = (slug) => {
      const i = master.findIndex((x) => x.slug === slug);
      return i === -1 ? -1 : i;
    };
    for (const key of ["createdAt", "published"]) {
      const v = a[key];
      if (!v) continue;
      const t = new Date(v).getTime();
      if (Number.isFinite(t)) return t;
    }
    return indexOf(a.slug);
  }

  eleventyConfig.addFilter("sortArticlesByDate", function (sectionItems, allArticles) {
    if (!Array.isArray(sectionItems) || !sectionItems.length) return sectionItems || [];
    const master = Array.isArray(allArticles) ? allArticles : [];
    return [...sectionItems].sort(
      (a, b) => articleRecencyRank(b, master) - articleRecencyRank(a, master)
    );
  });

  eleventyConfig.addFilter("articlesSortedNewestFirst", function (allArticles) {
    if (!Array.isArray(allArticles) || !allArticles.length) return [];
    const master = allArticles;
    return [...allArticles].sort(
      (a, b) => articleRecencyRank(b, master) - articleRecencyRank(a, master)
    );
  });

  eleventyConfig.addFilter("limit", function (arr, n) {
    if (!Array.isArray(arr)) return [];
    const c = Math.max(0, Math.floor(Number(n)) || 0);
    return arr.slice(0, c);
  });

  /** Articles for the /finance/ hub: money-finance section or money-finance label. */
  eleventyConfig.addFilter("financeHubArticles", function (articles) {
    return (articles || []).filter(
      (a) =>
        a.section === "money-finance" ||
        (a.labels || []).includes("money-finance")
    );
  });

  /** Articles for the /body-image/ hub: body-image section or body-image label. */
  eleventyConfig.addFilter("bodyImageHubArticles", function (articles) {
    return (articles || []).filter(
      (a) =>
        a.section === "body-image" ||
        (a.labels || []).includes("body-image")
    );
  });

  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addFilter("json", (obj) => JSON.stringify(obj));

  eleventyConfig.addFilter("labelToTitle", function (label) {
    return label
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  });

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "layouts",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    pathPrefix: "/",
  };
};
