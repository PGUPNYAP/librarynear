import { getSiteUrl } from "@/lib/site-url";
import { Shield, Flame, Stethoscope, Activity, AlertTriangle, Zap, Phone, BookOpen, Clock, HardHat } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  alternates: { canonical: `${getSiteUrl()}/guides/librarian-emergency` },
  title: "Librarian Emergency Protocol",
  description: "Official crisis management and comprehensive response procedures for library staff during emergencies.",
};

export default function LibrarianEmergencyGuidePage() {
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
            <div className="p-4 rounded-2xl shadow-sm border bg-indigo-50 text-indigo-600 border-indigo-100">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-bold text-black tracking-tight">
                Librarian Emergency Protocol
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Official crisis management, advanced preparation, and response procedures for library staff.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-8">
          <GuideCard 
            icon={BookOpen}
            colorClass="bg-slate-100 text-slate-700 border-slate-200"
            title="General Readiness & Preventative Measures"
            content={
              <ul className="space-y-4 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Maintain Emergency Kits:</strong> Ensure First-Aid kits, AEDs, flashlights, and emergency radios are fully stocked and accessible. Inspect them monthly.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Clear Aisles:</strong> Routinely check that aisles, emergency exits, and stairwells are free from books, chairs, and clutter.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Know Your Facility:</strong> Familiarize yourself with the location of all fire alarms, extinguishers, main power breakers, and water shut-off valves.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-slate-500 mt-2 shrink-0"/><span><strong className="text-gray-900 font-semibold">Emergency Contacts:</strong> Keep a physical copy of local emergency numbers (Police, Fire, Hospital, Building Management) at the circulation desk.</span></li>
              </ul>
            }
          />

          <GuideCard 
            icon={Flame} 
            colorClass="bg-orange-50 text-orange-600 border-orange-100"
            title="Fire & Smoke Emergencies"
            content={
              <div className="space-y-4">
                <p className="text-gray-700 leading-relaxed">
                  Fire spreads rapidly, and smoke inhalation is the primary danger. Your role is to ensure complete evacuation rather than firefighting.
                </p>
                <ul className="space-y-3 list-none p-0 m-0">
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Trigger Alarm:</strong> Immediately activate the nearest fire pull station and call emergency services (112).</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Coordinate Evacuation:</strong> Direct students to the nearest emergency exits using a firm, calm voice. Prohibit the use of elevators.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Sweep the Area:</strong> Do a rapid sweep of study areas, restrooms, and private carrels to ensure no one is left behind. Close (but do not lock) doors behind you to slow the spread of fire.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Grab Essentials:</strong> If safe, grab the library emergency kit and student sign-in roster before exiting.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-orange-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,146,60,0.6)]"/><span><strong className="text-gray-900 font-semibold">Assembly Point:</strong> Do a headcount at the designated assembly point outside. Inform the fire department of any unaccounted individuals upon their arrival.</span></li>
                </ul>
              </div>
            }
          />
          
          <GuideCard 
            icon={Stethoscope} 
            colorClass="bg-blue-50 text-blue-600 border-blue-100"
            title="Medical Emergencies"
            content={
              <div className="space-y-4">
                <p className="text-gray-700 leading-relaxed">
                  Medical emergencies require swift, calculated action. Time is critical, especially in cases of cardiac arrest or severe bleeding.
                </p>
                <ul className="space-y-3 list-none p-0 m-0">
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Assess & Call:</strong> Check the victim's responsiveness. Immediately call 112 for severe injuries, unconsciousness, seizures, or breathing issues.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Provide Care:</strong> Retrieve the First-Aid kit and AED. Administer CPR or basic first aid only if you are certified. If not, ask loudly if there is a trained medical professional nearby.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Crowd Control:</strong> Instruct other students to step back to give the patient privacy and clear a path for emergency medical services (EMS).</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Direct EMS:</strong> Send a designated student or staff member to the main entrance/street level to guide paramedics directly to the scene to save time.</span></li>
                  <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(96,165,250,0.6)]"/><span><strong className="text-gray-900 font-semibold">Documentation:</strong> Record the incident details, time, and witness information in the incident log once the patient is transported.</span></li>
                </ul>
              </div>
            }
          />
          
          <GuideCard 
            icon={Activity} 
            colorClass="bg-amber-50 text-amber-600 border-amber-100"
            title="Earthquakes & Structural Threats"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Immediate Action:</strong> Yell "Drop, Cover, and Hold On!" loudly to alert students. Take cover yourself under a sturdy desk or the circulation counter.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Post-Shaking Check:</strong> Once shaking stops entirely, systematically check the library for structural damage, fallen bookshelves, and injured students. Beware of aftershocks.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"/><span><strong className="text-gray-900 font-semibold">Evacuate Safely:</strong> If the building is compromised, windows are broken, or there are gas leaks, initiate a calm evacuation using the stairs. Do not use elevators.</span></li>
              </ul>
            }
          />
          
          <GuideCard 
            icon={AlertTriangle} 
            colorClass="bg-red-50 text-red-600 border-red-100"
            title="Unruly Behavior & Security Threats"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">De-escalate:</strong> Maintain a calm, professional demeanor. Ask the disruptive individual to step outside to discuss the issue away from studying students.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">Contact Authorities:</strong> If the individual becomes violent, abusive, or refuses to leave, do not physically engage. Retreat to a safe area and call local police (112) or building security immediately.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(248,113,113,0.6)]"/><span><strong className="text-gray-900 font-semibold">Active Threat/Lockdown:</strong> If an active threat (e.g., weapon) is present, initiate a lockdown. Announce the lockdown, lock the main doors, turn off lights, and instruct students to hide silently out of sight from windows/doors.</span></li>
              </ul>
            }
          />
          
          <GuideCard 
            icon={Zap} 
            colorClass="bg-yellow-50 text-yellow-600 border-yellow-100"
            title="Power Outages & Infrastructure Failure"
            content={
              <ul className="space-y-3 list-none p-0 m-0">
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-yellow-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(250,204,21,0.6)]"/><span><strong className="text-gray-900 font-semibold">Stay Calm:</strong> Announce that it is a power failure and instruct students to remain seated while emergency lighting kicks in.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-yellow-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(250,204,21,0.6)]"/><span><strong className="text-gray-900 font-semibold">Assess & Inform:</strong> Contact building management or the power company to determine the expected duration. Distribute flashlights from the emergency kit.</span></li>
                <li className="flex gap-3"><div className="w-2 h-2 rounded-full bg-yellow-400 mt-2 shrink-0 shadow-[0_0_8px_rgba(250,204,21,0.6)]"/><span><strong className="text-gray-900 font-semibold">Evacuation Protocol:</strong> If power is out for more than 30 minutes, there is poor ventilation, or if life safety systems (like fire alarms) are disabled, execute an orderly evacuation and close the library temporarily.</span></li>
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
