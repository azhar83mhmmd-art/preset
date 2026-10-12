-- Jalankan di Supabase > SQL Editor (aman dijalankan ulang)
create table if not exists recent_presets (
  id bigint generated always as identity primary key,
  source_url text,                      -- link TikTok yang dicari
  title text,
  thumbnail text,
  preset_link text not null,            -- tautan preset untuk Import / Salin
  created_at timestamptz not null default now()
);

-- satu preset hanya tampil sekali; dicari lagi = naik ke paling atas
alter table recent_presets drop constraint if exists recent_presets_source_url_key;
create unique index if not exists recent_presets_link_uq on recent_presets (preset_link);
create index if not exists recent_presets_created_idx on recent_presets (created_at desc);

alter table recent_presets enable row level security;
drop policy if exists "public read" on recent_presets;
create policy "public read" on recent_presets for select using (true);
-- tanpa policy insert/update: penulisan hanya lewat API server (service key)

-- sisakan 10 terbaru; yang paling lama otomatis terhapus
create or replace function trim_recent_presets() returns trigger
language plpgsql security definer as $$
begin
  delete from recent_presets
  where id not in (
    select id from recent_presets order by created_at desc, id desc limit 10
  );
  return null;
end $$;

drop trigger if exists trg_trim_recent on recent_presets;
create trigger trg_trim_recent
after insert or update on recent_presets
for each statement execute function trim_recent_presets();
