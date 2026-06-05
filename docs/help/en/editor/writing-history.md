# Writing history

The **writing history** shows how much you have written over time. It
is the detailed counterpart to the
[writing-goal widget](writing-goals.md) on the Dashboard: instead of
just today, you see a whole period with statistics, a per-day chart,
and a breakdown by book and chapter.

## What it does

The writing history is **global**: it covers all of your books at once,
not a single book. It reads the per-day word counts that Bibliogon
records whenever you save a chapter and presents them as:

- summary statistics for the chosen period,
- a per-day bar chart,
- a per-book list that drills down into per-chapter totals,
- a CSV export of the daily totals.

It is a full page in the app (its own screen), so you can bookmark it
and use your browser's Back button to return.

## How to use

1. Open the Dashboard.
2. In the writing-goal widget, click the **History** button.
3. At the top of the page, pick the time window: **Last 30 days**,
   **Last 90 days**, or **Last 365 days**. All statistics and the chart
   update to match.
4. Read the summary cards and the chart for the at-a-glance view.
5. In the **By book** list, click a book row to expand its per-chapter
   breakdown. Click it again to collapse.
6. To take the data elsewhere, click **Export CSV**.
7. Use your browser's Back button (or the Back control on the page) to
   return to where you came from.

## Statistics

The summary cards show, for the selected window:

- **Total words** written.
- **Active days** (days with net positive words written).
- **Avg per active day**.
- **Current streak** of consecutive active days.
- **Longest streak** in the window.

Below the cards, a **bar chart** shows the words written per day. Hover
a bar to see that day's exact value. If there is no writing in the
window, a short "no writing history in this period yet" message appears
instead of the chart.

## By book and chapter

The **By book** list shows total words per book in the window, each with
a small bar so you can compare books at a glance. Click a book to expand
its **per-chapter** breakdown. Words whose chapter has since been
deleted collect under **Deleted chapters** and stay attributed to the
book.

## CSV export

The **Export CSV** button downloads the daily history for the selected
window as a CSV file. The file contains one row per day, so you can open
it in a spreadsheet or feed it into your own analysis.

## Where to find it

Open it from the **History** button on the writing-goal widget on the
Dashboard. The page has its own address, so once it is open you can
bookmark it for quick access later.

## How the data is collected

Whenever you save a chapter, Bibliogon counts the change in word count
and credits it to that book and chapter for the current day. Only **net**
words written are counted, so deleting text reduces a day's total. The
daily goal itself is per device and does not feed the history; the
history is the same on any device that connects to your library.

## Tips

- Switch to the **365 days** window before an Export CSV when you want a
  full-year record for your own tracking.
- A run of low or empty days in the chart is normal during heavy editing
  or research, when you remove as much as you add.
- The current and longest streaks here count **active days** (any net
  writing), which is broader than the daily-goal streak on the Dashboard
  (days that reached your goal).

## Related

- [Writing goals](writing-goals.md): the daily goal, streak, and word targets
- [Storyboard view](../books/storyboard.md): per-chapter targets, status, and labels
- [Snapshots](snapshots.md): saved versions of a chapter's text over time
