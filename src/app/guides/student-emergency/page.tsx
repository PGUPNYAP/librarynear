import { getSiteUrl } from "@/lib/site-url";
import { Users, Flame, Stethoscope, Activity, AlertTriangle, ChevronLeft, Map, Ear, Footprints } from "lucide-react";
import { IntentLink } from "@/components/intent-link";

export const metadata = {
  alternates: { canonical: `${getSiteUrl()}/guides/student-emergency` },
  title: "Student Safety Guide",
  description: "Essential safety instructions and emergency protocols for students inside study libraries.",
};

export default function StudentEmergencyGuidePage() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/30">
      <div className="container mx-auto px-6 py-12 md:px-10 max-w-5xl">
        <div className="mb-10">
          <IntentLink
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-black transition-colors mb-8 bg-white border border-border px-4 py-2 rounded-full shadow-sm hover:shadow-md"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Home
          </IntentLink>

          <div className="flex items-center gap-4 border-b border-border/50 pb-8">
            <div className="p-4 rounded-2xl shadow-sm border bg-emerald-50 text-emerald-600 border-emerald-100">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-bold text-black tracking-tight">
                Student Safety Guide
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Essential safety instructions and survival protocols for students during library emergencies.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-8">
          <GuideCard 
            icon={Map}
            colorClass="bg-slate-100 text-slate-700 border-slate-200"
            title="Everyday Safety Habits"
            content={
              <ul className="space-y-4 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Know Your Exits:</strong> The first thing you should do when sitting down in a new library is locate the two nearest exits. Do not assume the main entrance is the safest way out.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Keep Aisles Clear:</strong> Do not leave heavy bags, laptop chargers, or large books sprawling into the walking aisles. These become dangerous trip hazards during a dark evacuation.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Listen to Staff:</strong> The librarian or library owner is the authority during an emergency. Always follow their instructions immediately without arguing.</span></li>
              </ul>
            }
          />

          <GuideCard 
            icon={Flame} 
            colorClass="bg-orange-50 text-orange-600 border-orange-100"
            title="Fire & Smoke Evacuation"
            content={
              <div className="space-y-4">
                <p className="text-gray-700 leading-relaxed">
                  Fire alarms must always be treated as real emergencies. Never ignore them assuming it's a drill.
                </p>
                <ul className="space-y-3 list-none p-0 m-0">
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Leave Belongings Behind:</strong> Do not waste time packing your laptop, phone, or books. Fire spreads in seconds; your life is more important than your devices.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Follow Exit Signs:</strong> Move quickly and calmly to the nearest illuminated emergency exit. Do not push or stampede.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">No Elevators:</strong> Never use the elevator during a fire alarm. The elevator shaft can act as a chimney for smoke, and power failures can trap you inside. Use the stairs.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Stay Low:</strong> If the room or hallway is filling with smoke, drop to your hands and knees and crawl to the exit. Smoke rises, so the cleanest air is near the floor.</span></li>
                </ul>
              </div>
            }
          />
          
          <GuideCard 
            icon={Stethoscope} 
            colorClass="bg-blue-50 text-blue-600 border-blue-100"
            title="Medical Emergencies"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Alert Staff Immediately:</strong> Notify the librarian or front desk staff about the situation. They have access to First-Aid kits and are trained to handle emergencies.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Call 112:</strong> If the librarian is unavailable or it's a severe emergency (like sudden collapse), call emergency services yourself and provide the exact floor and room number.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Clear the Area:</strong> Give the affected person plenty of space to breathe. Ask other students to move back and clear the aisles for paramedics.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Do Not Move Them:</strong> Unless they are in immediate danger (like a fire), do not move an injured person, as this can worsen spinal injuries.</span></li>
              </ul>
            }
          />
          
          <GuideCard 
            icon={Activity} 
            colorClass="bg-amber-50 text-amber-600 border-amber-100"
            title="Earthquake Protocol"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Drop, Cover, Hold On:</strong> Drop to the floor immediately, take cover under a sturdy study table or desk, and hold onto its legs to prevent it from shifting away from you.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Avoid Falling Hazards:</strong> Stay far away from windows (which may shatter), tall unsecured bookshelves, and heavy overhead light fixtures.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Do Not Run Outside:</strong> Do not evacuate while the building is actively shaking. You are more likely to be injured by falling debris outside the building. Wait for instructions from the librarian once the tremor stops completely.</span></li>
              </ul>
            }
          />
          
          <GuideCard 
            icon={AlertTriangle} 
            colorClass="bg-red-50 text-red-600 border-red-100"
            title="Security & Active Threats"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">Avoid Conflict:</strong> If you witness a physical altercation or aggressive behavior between other students, do not try to intervene or record the incident.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">Report Quietly:</strong> Leave the immediate area and inform the library staff or call local police (112) from a safe distance.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">Lockdown / Hide:</strong> If an active threat is announced (e.g., an armed individual), follow lockdown procedures: hide under desks, stay completely silent, turn your phone to completely silent (no vibrate), and turn off laptop screens. Do not move until given the all-clear by verified police officers.</span></li>
              </ul>
            }
          />
        </div>
      </div>
    </div>
  );
}

function GuideCard({ icon: Icon, title, content, colorClass }: any) {
  return (
    <div className="group bg-white border border-border/60 rounded-2xl p-6 md:p-10 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        <div className={`p-4 rounded-2xl shrink-0 border ${colorClass}`}>
          <Icon className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-black mb-5">{title}</h2>
          <div className="text-muted-foreground text-lg leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
