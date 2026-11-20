# Clean FB

A Chrome extension that turns Facebook into a content-only feed:

- Hides the left (shortcuts) and right (contacts, sponsored, birthdays) sidebars
- Hides ads / sponsored posts (incl. 贊助), even when Facebook scrambles the label
- Hides Reels (posts and the "Reels and short videos" carousel)
- Hides 你可能認識的朋友 / People you may know
- Optional: hides "Suggested for you" posts

Posts loaded while you scroll are checked as they appear (MutationObserver), including
posts whose text is filled in after the post is inserted.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Reload any open Facebook tabs.

Use the popup to toggle each filter; changes apply live to all open Facebook tabs.

## Debugging

Hidden elements carry `data-cleanfb-hide="ads|reels|friends|suggested"` or
`data-cleanfb-rail="left|right"`. Turn a filter off in the popup to reveal them.

## Roadmap

- AI-generated content filter
