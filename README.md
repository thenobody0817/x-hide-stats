# x-hide-stats

Violentmonkey userscript that removes the popularity counters from x.com.

The point is not "hide numbers" — it is to stop the feed from scoring you.
Reply counts, repost counts, like counts, view counts, follower counts and
post counts disappear, and so do the numbers that screen readers would
otherwise announce.

## What it hides

| Group | Hidden |
| --- | --- |
| Engagement counts | reply, repost, like and bookmark counters on every post |
| View counts | the view counter in the action bar, the "N Views" chunk above a post, impression counters |
| Profile stats | follower, following and post counts on profiles and in user cards |

Buttons, icons, hit areas and every link stay exactly where they were. Only the
number disappears.

The counters also disappear from the accessibility tree. The classic front-end
puts the count into the accessible name (`aria-label="15 Replies. Reply"`), so
the script rewrites those labels to drop the count — a screen reader announces
"Reply", not "15 Replies. Reply".

## Install

1. Open [Violentmonkey](https://violentmonkey.github.io/) in Firefox/Chrome/Edge.
2. Create a new script and paste the whole contents of `x-hide-stats.user.js`.
   Or drag the file into the Violentmonkey window.
3. Reload x.com.

## Controls

Right-click the Violentmonkey icon in the toolbar → menu:

- *Engagement counts (reply / repost / like / bookmark): ON/OFF*
- *View counts (views / impressions): ON/OFF*
- *Profile stats (followers / following / posts): ON/OFF*
- *Reset all groups to ON*

State is remembered between sessions.

## How it works

Two front-ends are in the wild, and the script covers both:

    classic  <button data-testid="reply"> ... <span data-testid="app-text-transition-container">15</span>
    2026     <div data-engagement-action="reply"> ... <span class="x-animated-count-visual">4K</span>

CSS hides the counter elements; a `MutationObserver` keeps the hiding in place
as x.com re-renders, and rewrites the `aria-label` values that still carry a
count. Nothing is removed from the DOM, so React never fights the script.

Counters are found by `data-testid`, `data-engagement-action` and `href`
endings — never by x.com's hashed CSS class names, which change on every
deploy.

## Tests

`test/harness.html` loads `test/fixtures/x-dom.html`, runs the script over it
and reports what is still visible: counts that survived, `aria-label` values
that still carry a number, and count+label cells that were not hidden.

    cd x-hide-stats
    python3 -m http.server 8765
    # then open http://127.0.0.1:8765/test/harness.html?fixture=x-dom

The fixture reproduces the markup of both x.com front-ends — the classic one
(`data-testid="reply"`, counts in `span[data-testid="app-text-transition-container"]`)
and the 2026 one (`data-engagement-action="reply"`, counts in
`.x-animated-count-visual`) — plus the permalink-bar view counter and the
profile follower/following/post counters.

It is hand-written from the shape of the real pages rather than copied from
them, so the repository carries no third-party markup and no real handles,
tweet text or user data. The class names in it are deliberately meaningless:
x.com rotates its hashed classes on every deploy, and a script that leans on
them breaks without warning.

Add `&noscript=1` to the URL to run the same checks without loading the
script — every check must then fail, which is what makes the run meaningful.


## License

MIT
