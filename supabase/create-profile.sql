-- how to create a staff profile after you make the auth user in supabase
-- replace the uuid / name / role values

insert into public.profiles (id, name, role)
values
  ('paste-auth-user-uuid-here', 'admin user', 'admin');

-- other examples:
-- ('paste-uuid', 'cashier one', 'cashier');
-- ('paste-uuid', 'kitchen one', 'kitchen');
