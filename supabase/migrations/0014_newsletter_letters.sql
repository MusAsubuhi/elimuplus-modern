-- 0014: the weekly letters, editable from the portal. Subscribers receive them one a week in position order. Safe to run twice.
create table if not exists public.newsletter_letters (
  id uuid primary key default gen_random_uuid(),
  position int not null,
  subject text not null,
  body text not null,                           -- plain text; a blank line starts a new paragraph
  created_at timestamptz not null default now()
);
alter table public.newsletter_letters enable row level security;
drop policy if exists nl_read on public.newsletter_letters;
create policy nl_read on public.newsletter_letters for select using (app.is_staff());
grant select on public.newsletter_letters to authenticated;

insert into public.newsletter_letters (position, subject, body)
select * from (values
 (1, 'Start small: one problem worth solving', E'Elimu+ begins with a simple idea: start small. Before a business plan or a job application, look around you for one real problem that people already pay money, time or effort to solve.\n\nThis week, write down three problems you saw in your own neighbourhood. Next to each, note who has it and what they do about it today. That short list is the beginning of every idea we work on with participants.'),
 (2, 'Turning your skills into value', E'Most young people know more than they give themselves credit for. A skill becomes value when someone else can name the result it gives them.\n\nPick one skill you have and finish this sentence: "I help ___ to ___ so that ___." If you cannot finish it yet, that is useful to know, and it is where we start.'),
 (3, 'Thinking clearly about income', E'Income thinking is about sustainability: what comes in, what goes out, and what is left to keep going. It applies whether you choose employment, entrepreneurship, or both.\n\nTry tracking everything you spend and earn for one week. You do not need a spreadsheet; a notebook is enough. Patterns appear quickly.'),
 (4, 'Finishing what you start', E'Many good ideas stop at the planning stage. Finishing is a habit, and habits grow from small, visible commitments.\n\nChoose one small thing you can complete in three days and tell someone you trust that you will do it. Then report back to them. Accountability is the simplest system there is.')
) v(position, subject, body)
where not exists (select 1 from public.newsletter_letters);
