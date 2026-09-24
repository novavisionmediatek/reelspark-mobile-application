import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Video } from '../types/database';

export function useUserVideos(userId: string) {
  return useQuery({
    queryKey: ['userVideos', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('submitted_by', userId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const videos = (data ?? []) as Video[];

      // Mark which videos the signed-in user has already liked
      if (videos.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (uid) {
          const { data: likes } = await supabase
            .from('video_likes')
            .select('video_id')
            .eq('user_id', uid)
            .in('video_id', videos.map((v) => v.id));
          const likedSet = new Set((likes ?? []).map((l) => l.video_id as string));
          videos.forEach((v) => {
            v.liked_by_me = likedSet.has(v.id);
          });
        }
      }

      return videos;
    },
  });
}
