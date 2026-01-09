import { Header } from "@/components/Header";
import { JobFeed } from "@/components/JobFeed";
import { Workbench } from "@/components/Workbench";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Header />
      <main className="flex-1 flex flex-col md:flex-row gap-6 p-6 h-[calc(100vh-64px)] overflow-hidden">
        <div className="w-full md:w-1/2 h-full">
          <JobFeed />
        </div>
        <div className="w-full md:w-1/2 h-full">
          <Workbench />
        </div>
      </main>
    </div>
  );
}
