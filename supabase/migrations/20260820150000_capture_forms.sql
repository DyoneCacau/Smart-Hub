-- Public, segment-aware lead capture forms.
create table if not exists public.capture_forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  segment text,
  objective text,
  submit_label text not null default 'Enviar',
  fields jsonb not null default '[]'::jsonb,
  source text not null default 'direct',
  medium text,
  campaign text,
  success_message text not null default 'Recebemos suas informações. Em breve entraremos em contato.',
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capture_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id uuid not null references public.capture_forms(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  visitor_id uuid,
  session_id uuid,
  answers jsonb not null default '{}'::jsonb,
  source text,
  medium text,
  campaign text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists idx_capture_forms_workspace on public.capture_forms(workspace_id, created_at desc);
create index if not exists idx_capture_submissions_workspace on public.capture_form_submissions(workspace_id, created_at desc);
create index if not exists idx_capture_submissions_form on public.capture_form_submissions(form_id, created_at desc);

alter table public.capture_forms enable row level security;
alter table public.capture_form_submissions enable row level security;

create policy "published capture forms are public"
on public.capture_forms for select to anon, authenticated
using (is_published = true or public.user_has_workspace_access(workspace_id));

create policy "workspace members manage capture forms"
on public.capture_forms for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

create policy "workspace members read capture submissions"
on public.capture_form_submissions for select to authenticated
using (public.user_has_workspace_access(workspace_id));

create or replace function public.submit_public_capture_form(
  p_slug text,
  p_answers jsonb,
  p_visitor_id uuid default null,
  p_session_id uuid default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_referrer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.capture_forms;
  v_lead public.leads;
  v_submission uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_company text;
  v_interest text;
  v_source text;
  v_medium text;
  v_campaign text;
begin
  select * into v_form from public.capture_forms where slug = p_slug and is_published = true limit 1;
  if v_form.id is null then raise exception 'capture form not found'; end if;

  v_name := nullif(trim(coalesce(p_answers->>'name','')), '');
  v_phone := nullif(trim(coalesce(p_answers->>'phone','')), '');
  v_email := nullif(trim(coalesce(p_answers->>'email','')), '');
  v_company := nullif(trim(coalesce(p_answers->>'company','')), '');
  v_interest := coalesce(
    nullif(trim(coalesce(p_answers->>'interest','')), ''),
    nullif(trim(coalesce(p_answers->>'project_type','')), '')
  );
  v_source := coalesce(nullif(p_utm_source,''), nullif(v_form.source,''), 'capture_form');
  v_medium := coalesce(nullif(p_utm_medium,''), v_form.medium);
  v_campaign := coalesce(nullif(p_utm_campaign,''), v_form.campaign);

  select * into v_lead from public.ingest_lead(
    v_form.workspace_id,
    v_name,
    v_phone,
    v_email,
    v_source,
    v_medium,
    v_campaign,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_utm_content,
    p_utm_term,
    null,
    null,
    p_visitor_id,
    jsonb_build_object(
      'capture_form_id', v_form.id,
      'capture_form_slug', v_form.slug,
      'capture_form_objective', v_form.objective,
      'briefing', coalesce(p_answers, '{}'::jsonb),
      'company', v_company
    )
  );

  update public.leads
  set company = coalesce(v_company, company),
      interest = coalesce(v_interest, interest),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('briefing', coalesce(p_answers, '{}'::jsonb)),
      updated_at = now()
  where id = v_lead.id
  returning * into v_lead;

  insert into public.capture_form_submissions (
    workspace_id, form_id, lead_id, visitor_id, session_id, answers,
    source, medium, campaign, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer
  ) values (
    v_form.workspace_id, v_form.id, v_lead.id, p_visitor_id, p_session_id, coalesce(p_answers, '{}'::jsonb),
    v_source, v_medium, v_campaign, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_referrer
  ) returning id into v_submission;

  insert into public.funnel_events (
    workspace_id, event_name, visitor_id, session_id, lead_id, source, medium, campaign,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, properties
  ) values (
    v_form.workspace_id, 'form_submitted', p_visitor_id, p_session_id, v_lead.id, v_source, v_medium, v_campaign,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    jsonb_build_object('form_id', v_form.id, 'form_slug', v_form.slug, 'submission_id', v_submission)
  );

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'submission_id', v_submission,
    'success_message', v_form.success_message
  );
end;
$$;

grant execute on function public.submit_public_capture_form(text,jsonb,uuid,uuid,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.track_public_capture_event(
  p_slug text,
  p_event_name text,
  p_visitor_id uuid default null,
  p_session_id uuid default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_properties jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.capture_forms;
begin
  if p_event_name not in ('page_view','form_view','form_started') then
    raise exception 'event not allowed';
  end if;
  select * into v_form from public.capture_forms where slug = p_slug and is_published = true limit 1;
  if v_form.id is null then return; end if;
  insert into public.funnel_events (
    workspace_id, event_name, visitor_id, session_id, source, medium, campaign,
    utm_source, utm_medium, utm_campaign, properties
  ) values (
    v_form.workspace_id, p_event_name, p_visitor_id, p_session_id,
    coalesce(p_utm_source, v_form.source), coalesce(p_utm_medium, v_form.medium), coalesce(p_utm_campaign, v_form.campaign),
    p_utm_source, p_utm_medium, p_utm_campaign,
    coalesce(p_properties, '{}'::jsonb) || jsonb_build_object('form_id', v_form.id, 'form_slug', v_form.slug)
  );
end;
$$;

grant execute on function public.track_public_capture_event(text,text,uuid,uuid,text,text,text,jsonb) to anon, authenticated;
