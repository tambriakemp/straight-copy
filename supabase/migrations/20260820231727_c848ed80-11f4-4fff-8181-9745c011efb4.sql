update agent_messages
set content = 'This turn produced nothing — no reply and no record was written. Nothing was created as a result of it.',
    error = coalesce(error, 'blank turn, backfilled')
where role = 'assistant'
  and coalesce(trim(content), '') = ''
  and coalesce(array_length(action_ids, 1), 0) = 0;