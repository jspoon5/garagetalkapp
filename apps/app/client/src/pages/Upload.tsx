import Header from "@/components/Header";
import UploadForm from "@/components/UploadForm";
import RequireContactInfo from "@/components/RequireContactInfo";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function Upload() {
  const { user } = useCurrentUser();
  
  return (
    <RequireContactInfo user={user}>
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Upload Video</h1>
          <p className="text-muted-foreground">
            Share your automotive repair knowledge with the community
          </p>
        </div>

        <UploadForm />
      </main>
    </div>
    </RequireContactInfo>
  );
}
