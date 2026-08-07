import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useCurrentUser() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/users/current"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user,
    userId: user?.id,
    isLoading,
    subscriptionTier: user?.subscriptionTier || "amateur",
  };
}
