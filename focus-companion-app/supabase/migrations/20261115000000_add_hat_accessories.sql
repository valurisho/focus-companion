insert into public.accessories (
  id,
  name,
  description,
  is_active,
  slot,
  icon,
  unlock_sessions,
  sort_order
)
values
  (
    'starlight_wizard_hat',
    'Starlight Wizard Hat',
    'A pointed hat sprinkled with stars.',
    true,
    'hat',
    '✨',
    5,
    3
  ),
  (
    'cloud_hat',
    'Cloud Hat',
    'A soft, wavy hat with a cloud-like crown.',
    true,
    'hat',
    '☁️',
    10,
    4
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  slot = excluded.slot,
  icon = excluded.icon,
  unlock_sessions = excluded.unlock_sessions,
  sort_order = excluded.sort_order;
