import HeroSection from "@/components/HeroSection";
import EmergencyCard from "@/components/EmergencyCard";
import FeatureGrid from "@/components/FeatureGrid";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50"> 
      <main className="flex-grow flex flex-col items-center justify-center px-4 py-8">
        <div className="max-w-4xl w-full text-center">
          <HeroSection/>
          <EmergencyCard isHomePage={true}/> 
          <FeatureGrid/>
        </div>
      </main>
    </div>
  );
}