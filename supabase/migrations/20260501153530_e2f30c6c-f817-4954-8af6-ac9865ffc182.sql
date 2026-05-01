
-- Internal helpers: revoke from anon and authenticated; only owner/postgres calls them
REVOKE ALL ON FUNCTION public._emit_notification(uuid,uuid,public.notification_kind,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._provider_admin_user_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._client_user_id_for_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_task_side_effects(uuid,text) FROM PUBLIC, anon, authenticated;

-- Public RPCs: deny anon, allow authenticated
REVOKE ALL ON FUNCTION public.create_action_task(public.action_task_type,uuid,uuid,text,text,uuid,jsonb,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_action_task(public.action_task_type,uuid,uuid,text,text,uuid,jsonb,timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.act_on_task(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_task(uuid,text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.add_task_comment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_task_comment(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.expire_stale_action_tasks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_contract_renewals() FROM PUBLIC, anon, authenticated;
