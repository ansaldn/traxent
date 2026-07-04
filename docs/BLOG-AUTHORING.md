# How to add a blog post

The blog is plain static HTML — no build step, same architecture as the firm and
`learn-101` pages. Adding a post is a copy-paste-and-fill job plus four small
list updates. Budget ~15 minutes.

## Files involved

| File | What it is |
|------|-----------|
| `src/blog.html` | The hub/index. Lists posts as cards; hosts the author-type + topic filter. |
| `src/blog-<slug>.html` | One file per post. Self-contained (inline `<style>`, own schema). |
| `src/sitemap.xml` | Add the post URL. |
| `src/feed.xml` | Add the post as an RSS `<item>`. |
| `src/robots.txt` | Already allows `/blog-` — no change needed for a normal post. |
| `src/llms.txt` | Update only if the topic set or cornerstone list changes. |

## Steps

1. **Copy a post.** Duplicate the closest existing post, e.g.
   `cp src/blog-ego-in-trading.html src/blog-<slug>.html`. Keep the whole
   `<style>` block identical so every post looks the same.

2. **Fill the `<head>`:** unique `<title>`, `meta description`, `<link rel="canonical">`
   (= `https://traxent.io/blog-<slug>`), the OG + Twitter tags, and update all three
   JSON-LD blocks — `BlogPosting` (headline/description/dates/author), and either
   `FAQPage` or `HowTo` if the post format suits it. Set `datePublished` /
   `dateModified` and the visible byline dates to the real publish date.

3. **Write the body.** One `<h1>` only (the post title). Use `<h2 id="...">` for
   sections and mirror those ids in the table-of-contents `<nav class="toc">`.
   Aim for 1,200+ words of genuinely useful, original content. Link out to the
   relevant firm pages (`/firm-ftmo` …), `/compare`, `/learn-101` and the product.

4. **Add the card** to `#post-grid` in `src/blog.html`. The two data attributes on
   the card `<a>` drive the filter:
   - `data-author-type="traxent"` **or** `"professional"`
   - `data-category="getting-funded"` **or** `"psychology"` (add a new value + a new
     topic button in the `.filter-btns[data-filter="category"]` group if you need a
     new topic).

5. **Add to `src/sitemap.xml`** (a `<url>` block) and **`src/feed.xml`** (an `<item>`).

6. **Keep the draft banner while reviewing.** New posts ship with a visible
   `.draft-banner` and an HTML comment at the top. **Remove both before publishing.**

## Author types — Traxent vs Professional

Every post is labelled by who wrote it, via a badge and the card's
`data-author-type`:

- **Traxent** (`data-author-type="traxent"`, `class="badge traxent"`) — in-house
  Traxent education team. Byline avatar `TX`, role "Traxent in-house education team".
- **Professional** (`data-author-type="professional"`, `class="badge pro"`) — written
  by a professional trader. For these, fill the **author bio card** in the post with
  the real person:
  - Avatar initials (e.g. `JS`), the trader's **name**, their **role/credential**
    (e.g. "Funded futures trader · 6 yrs"), the `badge pro` badge, and a 1–2 sentence
    **bio**. Also change the byline `.by-who` / `.by-role` to match.
  - Update the `BlogPosting` schema `author` from
    `{"@type":"Organization","name":"Traxent"}` to
    `{"@type":"Person","name":"<Full name>","description":"<short bio>"}`.

The filter on `/blog` (All / Traxent / Professional) then picks the post up
automatically from the `data-author-type` attribute — no JS changes required.

## The filter (how it works)

`src/blog.html` contains a small inline script (no dependencies). It reads the
`data-author-type` and `data-category` attributes on each `.card` and shows/hides
cards to match the active buttons. With JavaScript disabled, **all cards are
visible** and the buttons are simply inert — nothing is hidden, so the page still
works. You don't need to touch the script to add a post; just set the two data
attributes correctly on the new card.

## Checklist before publishing a post

- [ ] Single `<h1>`; TOC ids match the `<h2>` ids.
- [ ] Canonical, OG, Twitter and JSON-LD all use the real slug and dates.
- [ ] Card added with correct `data-author-type` + `data-category`.
- [ ] Added to `sitemap.xml` and `feed.xml`.
- [ ] `.draft-banner` div and the top DRAFT comment **removed**.
- [ ] Educational disclaimer present; no financial-advice language or return promises.
- [ ] Passes the deploy HTML integrity gate (ends in `</html>`, balanced `<script>` tags).
