import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-16">
        <Image src="/logo.png" alt="The Common Nose" width={496} height={392} className="mx-auto h-40 w-auto mb-4" priority />
        <h1 className="font-sans font-bold text-5xl md:text-6xl text-violet-900 mb-3">
          The Common Nose
        </h1>
        <p className="italic text-lg text-violet-500 mb-6">
          Tell us your favourites. We&apos;ll find you something new.
        </p>
        <p className="text-violet-600 max-w-lg mx-auto leading-relaxed">
          A recommendation engine built on 68,000 fragrances. We use accord-based
          similarity &mdash; how perfumes actually smell &mdash; to find your next favourite scent.
        </p>
      </div>

      {/* Three paths */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        <Link
          href="/explore"
          className="group block bg-white border border-violet-200 rounded-xl p-8 hover:border-violet-400 transition-all hover:shadow-sm"
        >
          <div className="text-2xl mb-3">&#128269;</div>
          <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-2 group-hover:text-violet-600 transition-colors">
            I know what I like
          </h2>
          <p className="text-sm text-violet-500 leading-relaxed">
            Search for your favourite perfumes, save up to 3 as Seeds, and get
            personalised recommendations based on their accord profiles.
          </p>
        </Link>
        <Link
          href="/build"
          className="group block bg-white border border-violet-200 rounded-xl p-8 hover:border-violet-400 transition-all hover:shadow-sm"
        >
          <div className="text-2xl mb-3">&#127912;</div>
          <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-2 group-hover:text-violet-600 transition-colors">
            I know what I want
          </h2>
          <p className="text-sm text-violet-500 leading-relaxed">
            Describe the scent you&apos;re looking for &mdash; pick the leading accords
            and trailing notes, and we&apos;ll find perfumes that match.
          </p>
        </Link>
        <Link
          href="/quiz"
          className="group block bg-white border border-violet-200 rounded-xl p-8 hover:border-violet-400 transition-all hover:shadow-sm"
        >
          <div className="text-2xl mb-3">&#10024;</div>
          <h2 className="font-sans font-bold text-xl font-medium text-violet-900 mb-2 group-hover:text-violet-600 transition-colors">
            I&apos;m new to perfume
          </h2>
          <p className="text-sm text-violet-500 leading-relaxed">
            Take a short quiz about your preferences and we&apos;ll match you with
            accords and starter perfumes tailored to your taste.
          </p>
        </Link>
      </div>

      {/* How it works */}
      <div className="border-t border-violet-200 pt-12">
        <h2 className="font-sans font-bold text-2xl font-medium text-violet-900 text-center mb-8">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="w-10 h-10 rounded-full bg-violet-900 text-white flex items-center justify-center mx-auto mb-3 text-sm font-medium">
              1
            </div>
            <h3 className="font-medium text-violet-900 mb-1">Choose your Seeds</h3>
            <p className="text-sm text-violet-500">
              Search our catalog of 68,000 fragrances or take the quiz to discover your accord profile.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-full bg-violet-900 text-white flex items-center justify-center mx-auto mb-3 text-sm font-medium">
              2
            </div>
            <h3 className="font-medium text-violet-900 mb-1">Get recommendations</h3>
            <p className="text-sm text-violet-500">
              We analyse the accord DNA of your Seeds and find similar fragrances using cosine similarity.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-full bg-violet-900 text-white flex items-center justify-center mx-auto mb-3 text-sm font-medium">
              3
            </div>
            <h3 className="font-medium text-violet-900 mb-1">Refine with votes</h3>
            <p className="text-sm text-violet-500">
              Thumbs up or down on recommendations. We update your preference profile and refine the results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
