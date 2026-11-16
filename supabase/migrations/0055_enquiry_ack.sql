alter table public.web_enquiries add column if not exists ack_sent_at timestamptz;
alter table public.web_enquiries add column if not exists ack_error text;
