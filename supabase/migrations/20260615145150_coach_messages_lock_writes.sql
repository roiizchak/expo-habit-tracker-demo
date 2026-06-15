-- Lock down coach_messages writes to the Edge Function only.
--
-- The initial migration gave clients a `for all` policy. coach_messages backs the
-- AI cost guards (rate-limit count + concurrency sentinel), so a client that can
-- INSERT/UPDATE/DELETE its own rows could reset its rate limit or plant fake
-- coaching text. The `ai-coach` Edge Function now writes these rows with the
-- service-role key (which bypasses RLS), so clients need read-only access at most.
drop policy if exists "own coach messages" on public.coach_messages;

create policy "read own coach messages" on public.coach_messages
  for select
  using (auth.uid() = user_id);
