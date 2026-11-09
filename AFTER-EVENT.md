# The 10-minute after-event ritual

Run this after every forum, cohort start or follow-up report. Template: the Forum 1 report and the blog post `blog/posts/2026-11-09-what-39-caregivers-taught-us-at-our-first-forum.md`.

1. **Update the facts (2 min).** Edit `site-facts.json` only: people total, cohort word, forum date, registered, savings interest, results, next forum, partner names. Then run `node build-facts.js`. It rewrites every page that shows the fact.
2. **Check (1 min).** Run `node build-facts.js --check`. It must say "All pages agree".
3. **Publish one blog or news item (5 min).** Copy the Forum 1 post file in `blog/posts/`, change the front matter and body, run `node build-blog.js`. Use the skill `elimu-report-to-post-and-newsletter` to draft it from the report.
4. **Send the newsletter (2 min).** Brevo draft from the post; pick the Partners list or the Newsletter list; send or schedule it in Brevo.
5. **Push to main.** Vercel redeploys; the weekly freshness check will confirm.

Rules: only facts from a signed-off report; round nothing up; no names or photos of caregivers without consent; keep partner emails out of this repo.

Adding a new fact: add a key to `site-facts.json`, then in the page wrap the text as `<!--f:key-->value<!--/f-->` (use `<!--f:key:cap-->` for a capital first letter) and run `node build-facts.js`.
