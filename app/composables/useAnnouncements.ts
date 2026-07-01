/**
 * Annonces admin (« god mode ») reçues dans une room : overlay plein écran avec
 * le message, ~4,5 s puis disparaît. Source = table `announcements` (écriture
 * réservée au service role → infalsifiable), reçue via Realtime INSERT.
 */
const SHOW_MS = 4500

export function useAnnouncements(roomId: string) {
  const supabase = useSupabaseClient()
  const announcement = ref<string | null>(null)
  let channel: ReturnType<typeof supabase.channel> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function show(message: string) {
    announcement.value = message
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (announcement.value = null), SHOW_MS)
  }

  onMounted(() => {
    channel = supabase
      .channel(`announce:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const m = (payload.new as { message?: string })?.message
          if (typeof m === 'string' && m) show(m)
        }
      )
      .subscribe()
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
    if (channel) supabase.removeChannel(channel)
  })

  return { announcement }
}
