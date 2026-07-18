alter table public.banned_words enable row level security;

revoke all on table public.banned_words
  from public, anon, authenticated;

revoke all on function public.is_username_clean(text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
