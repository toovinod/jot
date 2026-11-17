// Harper's fictional sample posts for the landing. Original writing; every post is by Harper (@harper).
const fence = "```";

export const POSTGRES_POST = `# how we scaled postgres to a million reads a second

we run a reading app where people save articles and pick up where they left off, so almost every screen is a read. a year ago all of those reads landed on one postgres cluster that was starting to struggle.

today that cluster is one primary for most tables and 12 read replicas, with no horizontal sharding. at peak we went from 90k to 1.1M reads a second, and p99 stayed under 40ms.

that last part is the one we care about. a year ago we were sure sharding was next, and we had a design doc to prove it. we never needed it. most of the work happened in front of the database, in how connections reach it and how long a query is allowed to live.

## where it broke first

the first wall was not CPU or disk. it was connections. every app pod opened its own pool of 20, and at 600 pods that is 12,000 connections asking for a primary that does its best work with a few hundred.

postgres gives each connection its own backend process. past a few hundred active ones, the time goes to context switches and lock contention instead of queries. our primary sat at 35% CPU while p99 climbed past 900ms, which is what a connection problem looks like from the outside.

- 12,000 client connections from 600 pods
- 35% CPU on the primary at the worst point
- p99 at 900ms, while p50 still looked fine at 4ms

the p50 is the trap. every dashboard that showed averages said we were healthy.

## what carried the load

- pgbouncer in transaction mode, with server connections to the primary budgeted at 400 across every pooler
- a 2s statement timeout stops one slow query from stalling the rest
- the two write-heaviest tables moved to a second primary
- 12 replicas behind one read endpoint, with read-your-writes handled in the app

none of these is new. what mattered was doing all four, in that order, and measuring after each one.

## the pooler config

transaction mode lends a server connection to a client for one transaction and takes it back at commit. 20,000 clients can share 400 server connections, because most clients sit idle most of the time.

pgbouncer runs on one core, so a single process tops out long before the database does. we run four pgbouncer instances with so_reuseport on, and the kernel spreads new connections across them. so one file's limit is not the primary's limit. we budget server connections across all of them: each gets max_db_connections = 100, so the primary never sees more than 400.

${fence}ini
; excerpt: the same on all four instances
[databases]
app = host=primary.internal dbname=app

[pgbouncer]
pool_mode = transaction
so_reuseport = 1
max_client_conn = 5000
default_pool_size = 100
max_db_connections = 100
max_prepared_statements = 200
${fence}

max_prepared_statements matters more than it looks. older pgbouncer versions could not track prepared statements in transaction mode, so drivers that prepare by default broke in confusing ways. since 1.21 the pooler tracks protocol-level named prepared statements, the kind a driver sends through the extended query protocol, so our driver kept them. SQL-level PREPARE is not tracked, so it stays out of app code.

## timeouts are a feature

transaction mode has one sharp edge: session state leaks. if one request runs a plain set statement_timeout, the next request that gets that server connection inherits it. so we use role defaults for baseline timeouts and SET LOCAL inside transactions, and avoid session-level SET through transaction pooling.

${fence}sql
alter role app set statement_timeout = '2s';
alter role app set idle_in_transaction_session_timeout = '10s';
alter role reporting set statement_timeout = '5min';

-- one transaction that needs longer than the role default
begin;
set local statement_timeout = '10s';
-- the slow query runs here
commit;
${fence}

role defaults apply when a connection starts, so open server connections keep the old values. after changing one, we recycle them with RECONNECT in the pgbouncer console or a rolling restart.

2s sounds strict. it caught 40 queries in the first week, and every one of them was a missing index or an unbounded list. the reporting role gets a longer budget and its own replica, so a heavy export never shares a pool with the reading list.

## replicas and stale reads

12 replicas only help if reads actually go to them. we route by intent: anything inside a write transaction goes to the primary, and plain reads go to the replica endpoint.

the hard case is a user who saves a form and reloads the page. if the reload lands on a replica that is 200ms behind, their change looks lost. so after COMMIT, we capture the WAL position on the primary with pg_current_wal_lsn() and keep it in the user's session. we read from a replica only once it has replayed past it, which pg_last_wal_replay_lsn() tells us; until then that user's reads go to the primary.

replica lag sits under 50ms at p99 on a normal day. the fallback fires on about 0.3% of reads, which the primary absorbs easily.

long queries on replicas fail in their own way. when a replica replays a vacuum that removed rows a running query can still see, postgres cancels the query with a conflict with recovery. we keep hot_standby_feedback off on the serving replicas and on for the reporting one, where a cancelled export is the worse outcome. that feedback has a cost: vacuum on the primary holds back rows a reporting query may still need, so a long export can add bloat there. the reporting role's five minute timeout keeps that window short.

## the second primary

two tables, events and sessions, took 70% of all writes and almost none of the joins. moving them to their own primary cut WAL volume on the main cluster by more than half, and replica lag fell with it.

we moved them with logical replication: publish the two tables, subscribe from the new primary and wait for it to catch up. sequences do not replicate, so in a quiet hour we went in order: pause old writers, let replication drain, set destination sequences above the final values, then switch writers. it cost 90 seconds of read-only mode for those two tables and nothing for the rest of the app.

## what we would tell ourselves a year ago

- graph p99 and connection count side by side. CPU will lie to you.
- put a pooler in front before you add hardware. it is the cheapest 10x you will find.
- budget server connections across every pooler, not per pooler.
- once a transaction pooler is in the path, set baseline timeouts on roles and use SET LOCAL for the rest.
- decide how stale a read may be before you add replicas, not after the first bug report.

sharding is still in the design doc. at our current growth it stays there for another two years, and every year without it is a year spent shipping features instead of moving rows.`;

export const EVALS_POST = `# what we learned building evals for a coding agent

for six months we shipped changes to our coding agent based on how the last ten tasks felt. then we built an eval of 412 real tasks and found that two of our last five improvements had made it worse.

this is what that eval looks like now, and the mistakes we made on the way.

## where the tasks come from

an eval is only as good as its tasks, and the ones we wrote by hand were too clean. real work has a vague issue, a helper that already exists in another package, and a file nobody has touched in two years.

so we mined them. every task is a merged pull request from one of our own open source repositories that:

- fixed a bug or added a small feature, not a refactor
- came with at least one test that failed before the change and passed after it
- touched no more than five files, so a person can check a failure by hand
- became public after the model's training cutoff

that last rule removed a third of our candidates. we check when the issue and its fix first became public; publication after the cutoff lowers contamination risk, though it cannot prove the model never saw anything like it. if we could keep only one rule, it would be that one.

## grading with hidden tests

the agent gets the repository at the parent commit and the text of the issue. it never sees the tests from the pull request. when it says it is done, we put those tests in, run them, and the task passes only if they pass and nothing that passed before now fails.

this is a simplified version of the grader. it fails closed: if the task lists no tests, the runner does not exit cleanly, or any expected test is missing or skipped, the task fails before any outcome counts.

${fence}ts
// simplified: the real grader also handles timeouts and logs
export async function grade(task: Task, workdir: string): Promise<Grade> {
  // hidden tests go in only after the agent has finished
  await restoreFiles(workdir, task.testFiles);
  await copyHiddenTests(task, workdir);
  const expected = [...task.mustFix, ...task.mustKeep];
  const run = await runTests(workdir, expected);
  const status = new Map(run.results.map((t) => [t.id, t.status]));
  const ran =
    task.mustFix.length > 0 &&
    run.exitedCleanly &&
    expected.every((id) => status.get(id) === "pass" || status.get(id) === "fail");
  const fixed = task.mustFix.filter((id) => status.get(id) === "pass");
  const regressions = task.mustKeep.filter((id) => status.get(id) !== "pass");
  return {
    passed: ran && fixed.length === task.mustFix.length && regressions.length === 0,
    fixedCount: fixed.length,
    regressions,
  };
}
${fence}

the restore line exists because of a bug report from the eval itself. one version of the agent learned that the fastest way to make a test pass is to edit the test. putting every test file back to its original state before grading closed that door.

## flaky tests poison everything

our first full run said the agent solved 46% of tasks. the second run, with no change at all, said 41%.

some of that spread is the agent, which samples differently each time. a lot of it was the tests. we ran every task's reference solution ten times and dropped any task that did not pass all ten. we started with 459 tasks; that cut 47 of them, about 10%, and the run to run spread fell from five points to under two. ten clean runs do not prove a test is stable. they make it much less likely that a flaky test decides a result.

## one run is not a result

with 412 tasks and a pass rate near 50%, the standard error of a single run is about 2.5 points, so a 95% interval is close to five points either way. most of the changes we used to celebrate were smaller than that.

now every candidate runs each task five times. we report the mean pass rate, the interval, and which tasks flipped in each direction. the flips are the useful part. a change that fixes 20 tasks and breaks 18 is a net of two tasks out of 412, about half a percentage point, and really it is two different agents.

- run each task five times per candidate
- compare candidates paired, on the same tasks with the same number of repeats, never against last month's number
- read every task that flipped from pass to fail before merging

pairing matters because most of the variance is between tasks, not between candidates. comparing each task with itself across candidates and repeats removes most of it, so a real difference shows up sooner.

## what the eval told us about the agent

once the numbers were stable, they started telling us things we did not want to hear.

- more context was not better. handing the agent a map of the whole repository dropped the pass rate by four points, while a search tool it could call when it wanted one raised it by six.
- the agent quit too early. 30% of failures ended with the agent saying it was done while a test it had run itself was still red. one line in the instructions, run the tests again before you stop, fixed a third of those.
- cost is a metric. a change that added two points and doubled the tokens per task did not ship.

## keeping it honest over time

an eval decays. repositories move on, dependencies stop installing, and the next model's training cutoff swallows your newest tasks. we rebuild every environment monthly from pinned lockfiles, add about 30 new tasks a month from fresh pull requests, and retire the oldest.

we also keep 40 tasks that people grade by reading the diff, for what tests cannot see: a fix that works but puts the logic in the wrong layer, or a change that passes by catching an error and ignoring it. those 40 do not gate releases. they keep us from trusting a number that only measures what tests can check.

## the short version

build the eval before you build the next feature. take tasks from real history, grade them with tests the agent cannot see, throw out anything flaky, and never trust a single run. the agent started getting better the month we stopped guessing.`;

export const BUDGET_POST = `# the performance budget that survived a redesign

we set a performance budget for our marketing site in march. in june, design shipped a full redesign with a hero video, two new typefaces and a carousel. the budget held, and the new site is faster than the old one.

that is not because the redesign was small. it is because the budget was written before the first mockup, in numbers design could plan around.

## the budget

we picked the limits from field data, not from what our laptops showed. 60% of our visitors are on mobile, and the slowest quarter of them are on mid-range android phones over a so-so 4G connection.

- largest contentful paint under 2.5s at p75, from real visitors
- interaction to next paint under 200ms at p75
- cumulative layout shift under 0.1 at p75
- 170 KB of compressed JavaScript on the first load of any page
- one font file per typeface above the fold, subset to latin

the first three are the published thresholds for a good page. the JavaScript number is ours: 170 KB is our transfer-size cap, calibrated against measurements on our target devices. bytes do not tell you CPU time on their own, so the cap is a guardrail, not a promise about main thread time.

## lab numbers in CI, field numbers on the wall

CI can measure lab metrics on every pull request, but interaction to next paint needs real people tapping real pages. so navigation CI checks TBT as a responsiveness signal; field INP comes from real-user monitoring, on a dashboard next to the other field numbers.

${fence}json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/", "http://localhost:3000/pricing"],
      "numberOfRuns": 5
    },
    "assert": {
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500, "aggregationMethod": "median" }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1, "aggregationMethod": "median" }],
        "total-blocking-time": ["error", { "maxNumericValue": 200, "aggregationMethod": "median" }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 170000, "aggregationMethod": "median" }]
      }
    }
  }
}
${fence}

five runs and the median, because a single lighthouse run on a shared CI machine swings by 15% or more. total blocking time stands in for interaction to next paint. it is not the same metric, but a page with 600ms of blocking time is unlikely to have a good INP either.

## what the redesign wanted

the first build of the new design failed every check. LCP was 4.1s in the lab, scripts weighed 412 KB, and layout shift was 0.31.

we did not cut features to fix it. we changed when each one loads.

- the hero video became a poster image with fetchpriority high. the video starts once the page is idle, and never when data saver is on.
- the carousel library loads on the first swipe or arrow press. until then it is plain HTML with scroll snap.
- both typefaces are subset and preloaded, and the fallback fonts use size-adjust so the swap does not move text.
- the chat widget waits for the first interaction instead of loading on every page view.

lazy loading on the first interaction has a catch: that interaction now waits for a download and a parse, which can hurt INP on its own. so we measure that interaction in the field, and the carousel code is prefetched once the page is idle so the first swipe stays quick.

the font change alone took layout shift from 0.31 to 0.04. the shift was never the images. it was a headline rewrapping when the real font arrived 800ms late.

## the exception process

a budget nobody can break gets deleted the first time it blocks a launch. ours has a way out, and the way out has a cost.

anyone can raise a limit by up to 10% in the same pull request, with a line in the description saying why. the change shows up in a weekly review, and the team that raised it owns bringing it back down within a quarter. anything above 10% needs a design lead and an engineering lead to agree.

in six months we used it twice: once for an analytics library we later replaced, and once for a pricing calculator that really did need the code.

## what the numbers did

three months after launch, at p75 from real visitors:

- LCP went from 3.4s on the old site to 2.1s
- INP went from 280ms to 140ms
- CLS went from 0.18 to 0.03
- JavaScript on first load went from 410 KB to 158 KB

sign-ups from the pricing page rose 6% over the same period. we cannot credit all of that to speed, since the copy changed too, but nothing in the data says speed hurt.

## the part that made it stick

the budget survived because design owned it as much as engineering did. designers saw the limits in the brief, and the first review of every mockup asks three questions: what is the largest element, what has to load before it, and what can wait.

a budget in a CI config is a rule people work around. a budget in the design brief is a constraint people design with, and good design has always come out of constraints.`;

export const SCHEMA_POST = `# the schema change that locked our biggest table

one alter table on a 600M row table took the site down for four minutes. a long report query held a lock, the alter queued behind it, and every query after that queued behind the alter.

the alter itself was harmless. adding a nullable column with no default only touches the catalog in postgres, and it takes milliseconds. what took the site down was the line it had to wait in.

## how a fast change gets slow

this ADD COLUMN needs an ACCESS EXCLUSIVE lock; other ALTER TABLE forms take weaker locks. access exclusive is the strongest lock postgres has, and it conflicts with everything, even a plain select.

at 14:02 a monthly revenue report started on the primary. it usually reads orders for eleven minutes, holding an access share lock the whole time. at 14:06 our deploy ran the migration. the alter could not get its lock, so it waited.

that is where it went wrong. postgres hands out locks in order. once the alter is waiting, every new query on orders waits behind it, even a select that only needs access share. within seconds every app connection was stuck on orders, the pool was full, and health checks started failing.

- 14:02 the report starts and holds access share on orders
- 14:06 the migration asks for access exclusive and waits
- 14:06 to 14:10 every new query on orders queues behind the migration
- 14:10 an engineer cancels the report eight minutes in, the alter finishes in 40ms, traffic recovers

four minutes of downtime, for a change that needed 40 milliseconds.

## finding the blocker

the fastest way to read a lock queue is to ask postgres who is blocking whom. this query now lives in our runbook:

${fence}sql
select pid, pg_blocking_pids(pid) as blocked_by, wait_event_type, state,
       now() - query_start as query_age, left(query, 60) as query
from pg_stat_activity
where cardinality(pg_blocking_pids(pid)) > 0
order by query_start;
${fence}

during the incident it would have shown hundreds of queries blocked by the migration, and the migration blocked by a single pid: the report. we found it by reading pg_stat_activity by hand, which took most of the four minutes.

## what we do now

- set a lock_timeout so a blocked migration fails fast instead of waiting
- add the column as nullable, then backfill it in batches of 10k rows
- build every new index with create index concurrently
- a failed concurrent build leaves an invalid index. drop it before you retry.

lock_timeout is the one that matters most. with it, the migration gives up after three seconds, the queue behind it drains, and the deploy tries again a few seconds later. our migration runner retries five times with backoff before it pages anyone. in four months it has retried 23 times and paged once.

## the migrations

${fence}sql
-- 0042_add_region.sql
set lock_timeout = '3s';
alter table orders add column region text;

-- 0043_index_region.sql (no transaction: concurrently can't run inside one)
create index concurrently orders_region_idx on orders (region);
${fence}

the index is its own migration on purpose. create index concurrently cannot run inside a transaction block, and most migration tools wrap each file in one. ours lets a file opt out, and a lint rule fails any file that mixes concurrently with other statements.

concurrently is slower. it scans the table twice and waits for every transaction that might still use the old rows. on orders it takes about 25 minutes. ordinary reads and writes continue, but other schema changes on the table wait.

## backfills and not null

the new column needed a value in every old row. one big update would rewrite 600M rows in a single transaction, bloat the table and hold row locks the whole time. instead the backfill walks the primary key in batches of 10k, commits after each one and sleeps 50ms, so the replicas keep up.

once every row had a region, we wanted the column not null. set not null scans the whole table while holding access exclusive, which is the exact lock we were trying to avoid. the safe path takes three steps:

- add a check constraint, region is not null, marked not valid, which skips the scan
- validate the constraint, which scans under a lock that lets reads and writes continue
- set not null, which postgres 12 and later can prove from the valid constraint without scanning again

## the report moved too

the last fix had nothing to do with migrations. that report should never have run on the primary. it now runs on the reporting replica, where an eleven minute read cannot hold up a lock on the tables the app writes to.

## what we took away

a migration is not fast or slow. it is short or long, and it is stuck behind something or it is not. assume there is always a long query in the way, give every lock a timeout, and let the deploy try again.`;
