-- Paid data is private, inaccessible to Supabase browser/API roles. Direct Microsoft
-- access tokens are validated by the application, not by Supabase Auth.
create schema enterprise;
revoke all on schema enterprise from public;
create role enterprise_app nologin nobypassrls;
create role enterprise_worker nologin nobypassrls;
grant usage on schema enterprise to enterprise_app, enterprise_worker;

create table enterprise.users (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, object_id uuid not null,
 name text not null, trial_workspace_id uuid, created_at timestamptz not null default now(), unique(tenant_id, object_id)
);
create table enterprise.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 240),
 plan text not null check(plan in ('enterprise','msp')), created_by uuid not null references enterprise.users,
 branding jsonb not null default '{}', created_at timestamptz not null default now()
);
create table enterprise.memberships (
 workspace_id uuid not null references enterprise.workspaces on delete cascade,
 user_id uuid not null references enterprise.users, display_name text, role text not null check(role in ('owner','admin','analyst','viewer','auditor')),
 customer_scope uuid[], expires_at timestamptz, created_at timestamptz not null default now(),
 primary key(workspace_id,user_id), check(role <> 'owner' or (customer_scope is null and expires_at is null)),
 check(role <> 'auditor' or expires_at is not null)
);
create index memberships_user on enterprise.memberships(user_id);
create table enterprise.tenants (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references enterprise.workspaces on delete cascade,
 tenant_id uuid not null, name text not null, kind text not null check(kind in ('production','test','customer','internal')),
 status text not null default 'pending' check(status in ('pending','connected','disconnected','error')),
 branding jsonb not null default '{}', consented_at timestamptz, last_collected_at timestamptz,
 next_collection_at timestamptz, health text, created_at timestamptz not null default now(),
 unique(workspace_id,tenant_id), unique(workspace_id,id)
);
create table enterprise.subscriptions (
 workspace_id uuid primary key references enterprise.workspaces on delete cascade,
 provider_id text unique, customer_id text, status text not null default 'pending',
 product_id text, interval text not null default 'month' check(interval in ('month','year')),
 quantity integer not null default 0 check(quantity >= 0), paid_through timestamptz,
 trial_ends_at timestamptz, founders_at timestamptz, discount_ends_at timestamptz,
 cancel_at_period_end boolean not null default false, synced_at timestamptz,
 last_event_at timestamptz, created_at timestamptz not null default now()
);
create table enterprise.invitations (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references enterprise.workspaces on delete cascade,
 email text not null, role text not null check(role in ('admin','analyst','viewer','auditor')),
 customer_scope uuid[], member_expires_at timestamptz, token_hash text not null unique,
 created_by uuid not null references enterprise.users, expires_at timestamptz not null,
 accepted_by uuid references enterprise.users, accepted_at timestamptz, revoked_at timestamptz,
 challenge_hash text, challenge_user uuid references enterprise.users, challenge_expires_at timestamptz,
 attempts integer not null default 0, challenged_at timestamptz, created_at timestamptz not null default now()
);
create table enterprise.records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references enterprise.workspaces on delete cascade,
 customer_id uuid, kind text not null check(kind in ('snapshot','baseline','standard','finding','exception','review','annotation','report','schedule','webhook','api_key','consent','delivery','maintenance','alert_route','billing_checkout')),
 name text not null, status text not null default 'active', version integer not null default 1,
 data jsonb not null default '{}', encrypted text, created_by uuid references enterprise.users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), expires_at timestamptz,
 foreign key(workspace_id,customer_id) references enterprise.tenants(workspace_id,id) on delete cascade
);
create index records_scope on enterprise.records(workspace_id,customer_id,kind,created_at desc);
create index records_expiry on enterprise.records(expires_at) where expires_at is not null;
create unique index records_active_key on enterprise.records((data->>'hash')) where kind='api_key';
create table enterprise.jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references enterprise.workspaces on delete cascade,
 customer_id uuid not null, kind text not null check(kind in ('collect','report','email','webhook')),
 dedupe_key text not null unique, payload jsonb not null default '{}', status text not null default 'queued' check(status in ('queued','running','complete','failed','canceled')),
 attempts integer not null default 0, available_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 error text, created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(workspace_id,customer_id) references enterprise.tenants(workspace_id,id) on delete cascade
);
create index jobs_claim on enterprise.jobs(available_at) where status in ('queued','running');
create table enterprise.audit_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references enterprise.workspaces on delete cascade,
 customer_id uuid, actor_id uuid references enterprise.users, action text not null, details jsonb not null default '{}',
 created_at timestamptz not null default now(),
 foreign key(workspace_id,customer_id) references enterprise.tenants(workspace_id,id) on delete cascade
);
create index audit_scope on enterprise.audit_events(workspace_id,customer_id,created_at desc);
create table enterprise.billing_events (
 id text primary key, type text not null, subject_id text not null, attempts integer not null default 0, error text, received_at timestamptz not null default now(), processed_at timestamptz,
 workspace_id uuid references enterprise.workspaces on delete set null
);
create table enterprise.trial_tenants (tenant_id uuid primary key, workspace_id uuid not null references enterprise.workspaces, claimed_at timestamptz not null default now());
create table enterprise.rate_limits (key text primary key, count integer not null default 1, resets_at timestamptz not null);

-- The only privileged identity lookup. Caller must supply claims validated by our
-- API; browser roles cannot execute this function or set connection context.
create function enterprise.identify(display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; tid uuid := nullif(current_setting('enterprise.tid',true),'')::uuid;
 oid uuid := nullif(current_setting('enterprise.oid',true),'')::uuid;
begin
 if tid is null or oid is null then raise exception 'Missing verified identity'; end if;
 insert into enterprise.users(tenant_id,object_id,name) values(tid,oid,left(display_name,200))
 on conflict(tenant_id,object_id) do update set name=excluded.name returning id into uid;
 return uid;
end $$;
create function enterprise.member_access(wid uuid, cid uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from enterprise.memberships m where m.workspace_id=wid
 and m.user_id=nullif(current_setting('enterprise.user_id',true),'')::uuid
 and (m.expires_at is null or m.expires_at > now())
 and (cid is null or m.customer_scope is null or cid=any(m.customer_scope)))
$$;
create function enterprise.provision(workspace_name text, workspace_plan text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := nullif(current_setting('enterprise.user_id',true),'')::uuid; wid uuid;
begin
 if uid is null or not exists(select 1 from enterprise.users where id=uid and tenant_id=nullif(current_setting('enterprise.tid',true),'')::uuid and object_id=nullif(current_setting('enterprise.oid',true),'')::uuid) then raise exception 'Missing verified identity'; end if;
 if (select count(*) from enterprise.workspaces where created_by=uid) >= 5 then raise exception 'Workspace creation limit reached'; end if;
 insert into enterprise.workspaces(name,plan,created_by) values(workspace_name,workspace_plan,uid) returning id into wid;
 insert into enterprise.memberships(workspace_id,user_id,role,display_name) values(wid,uid,'owner',(select name from enterprise.users where id=uid));
 insert into enterprise.subscriptions(workspace_id) values(wid);
 return wid;
end $$;
-- Serializes owner changes even when two owners are removed concurrently.
create function enterprise.protect_owner() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from enterprise.workspaces where id=old.workspace_id for update;
 if old.role='owner' and (tg_op='DELETE' or new.role<>'owner') and
 (select count(*) from enterprise.memberships where workspace_id=old.workspace_id and role='owner') <= 1 then
 raise exception 'Cannot remove the final workspace owner'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger final_owner before update or delete on enterprise.memberships for each row execute function enterprise.protect_owner();
revoke all on all functions in schema enterprise from public;
grant execute on function enterprise.identify(text), enterprise.member_access(uuid,uuid), enterprise.provision(text,text) to enterprise_app;
grant execute on function enterprise.member_access(uuid,uuid), enterprise.protect_owner() to enterprise_worker,enterprise_app;

do $$ declare t text; begin
 foreach t in array array['users','workspaces','memberships','tenants','subscriptions','invitations','records','jobs','audit_events','billing_events','rate_limits','trial_tenants'] loop
 execute format('alter table enterprise.%I enable row level security',t);
 execute format('create policy worker on enterprise.%I to enterprise_worker using (true) with check (true)',t);
 end loop;
end $$;
grant select,insert,update,delete on all tables in schema enterprise to enterprise_worker;
revoke update,delete on enterprise.audit_events from enterprise_worker;
grant select,update on enterprise.workspaces to enterprise_app;
grant select,insert,update,delete on enterprise.memberships,enterprise.tenants,enterprise.invitations,enterprise.records,enterprise.jobs to enterprise_app;
grant select on enterprise.subscriptions to enterprise_app;
grant select,insert on enterprise.audit_events to enterprise_app;
create policy workspace_access on enterprise.workspaces to enterprise_app using(enterprise.member_access(id)) with check(enterprise.member_access(id));
create policy membership_access on enterprise.memberships to enterprise_app using(enterprise.member_access(workspace_id)) with check(enterprise.member_access(workspace_id));
create policy tenant_access on enterprise.tenants to enterprise_app using(enterprise.member_access(workspace_id,id)) with check(enterprise.member_access(workspace_id,id));
create policy subscription_access on enterprise.subscriptions for select to enterprise_app using(enterprise.member_access(workspace_id));
create policy invitation_access on enterprise.invitations to enterprise_app using(enterprise.member_access(workspace_id)) with check(enterprise.member_access(workspace_id));
create policy record_access on enterprise.records to enterprise_app using(enterprise.member_access(workspace_id,customer_id)) with check(enterprise.member_access(workspace_id,customer_id));
create policy job_access on enterprise.jobs to enterprise_app using(enterprise.member_access(workspace_id,customer_id)) with check(enterprise.member_access(workspace_id,customer_id));
create policy audit_read on enterprise.audit_events for select to enterprise_app using(enterprise.member_access(workspace_id,customer_id));
create policy audit_append on enterprise.audit_events for insert to enterprise_app with check(enterprise.member_access(workspace_id,customer_id) and actor_id=nullif(current_setting('enterprise.user_id',true),'')::uuid);
-- Provision dedicated LOGIN credentials separately; never use postgres/service_role
-- in the web application. See docs/enterprise-operations.md for role grants.

create function enterprise.claim_trial(wid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid := nullif(current_setting('enterprise.user_id',true),'')::uuid; claimed uuid;
begin
 if uid is null or not exists(select 1 from enterprise.memberships where workspace_id=wid and user_id=uid and role='owner') then raise exception 'Workspace owner required'; end if;
 select trial_workspace_id into claimed from enterprise.users where id=uid for update;
 if claimed is not null and claimed<>wid then return false; end if;
 update enterprise.users set trial_workspace_id=wid where id=uid;return true;
end $$;
revoke all on function enterprise.claim_trial(uuid) from public;
grant execute on function enterprise.claim_trial(uuid) to enterprise_app;
