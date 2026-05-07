import { MarketBootstrap } from "@/components/MarketBootstrap";
import { SimEngine } from "@/components/SimEngine";
import { TopBar } from "@/components/sections/TopBar";
import { Hero } from "@/components/sections/Hero";
import { Ladder } from "@/components/sections/Ladder";
import { Sim } from "@/components/sections/Sim";
import { Engine } from "@/components/sections/Engine";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <MarketBootstrap />
      <SimEngine />
      <TopBar />
      <main>
        <Hero />
        <Ladder />
        <Sim />
        <Engine />
      </main>
      <Footer />
    </>
  );
}
