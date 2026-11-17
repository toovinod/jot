import { Footer, Header } from "@/components/shell";
import { Hero } from "@/components/landing/hero";
import { Demo } from "@/components/landing/demo";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Readers } from "@/components/landing/readers";
import { Closing } from "@/components/landing/closing";

export default function Home() {
  return (
    <>
      <Header tone="sky" />
      <main className="overflow-x-clip">
        <Hero />
        <Demo />
        <HowItWorks />
        <Features />
        <Readers />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
