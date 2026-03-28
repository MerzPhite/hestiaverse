const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("related", function (articles, current) {
    if (!current?.labels?.length) return [];
    const currentLabels = new Set(current.labels);
    return articles
      .filter((a) => a.slug !== current.slug && a.labels?.some((l) => currentLabels.has(l)))
      .slice(0, 5);
  });

  eleventyConfig.addFilter("where", function (arr, key, val) {
    return (arr || []).filter((item) => item[key] === val);
  });

  /**
   * Home page sections: sort by `published` (ISO `YYYY-MM-DD`) when set, else by order in
   * `_data/articles.js` (later in the file = newer). Newest first.
   */
  eleventyConfig.addFilter("sortArticlesByDate", function (sectionItems, allArticles) {
    if (!Array.isArray(sectionItems) || !sectionItems.length) return sectionItems || [];
    const master = Array.isArray(allArticles) ? allArticles : [];
    const indexOf = (slug) => {
      const i = master.findIndex((a) => a.slug === slug);
      return i === -1 ? -1 : i;
    };
    const rank = (a) => {
      if (a.published) {
        const t = new Date(a.published).getTime();
        return Number.isFinite(t) ? t : indexOf(a.slug);
      }
      return indexOf(a.slug);
    };
    return [...sectionItems].sort((a, b) => rank(b) - rank(a));
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
