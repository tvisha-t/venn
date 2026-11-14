#!/usr/bin/env python3
"""
Generate mock data for the Venn @ GT MVP.

Outputs (in ../mock-data):
  - alumni_association_export.csv : what a GT Alumni Association data export could look like
                                    (raw, messy-ish, includes records that MUST be filtered out)
  - claimed_members.json          : people who signed up themselves (students, alumni, faculty, learners)
  - intro_requests.json           : a few seeded intro requests in different states
  - cities.json                   : city centroids used for geocoding + map clustering

All people are FICTIONAL. Emails use reserved example domains. Deterministic (seeded) so the
team always gets the same data.

Usage:  python3 scripts/generate_mock_data.py [--alumni 600] [--members 60] [--seed 42]
"""
import argparse
import csv
import json
import random
import uuid
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "mock-data"

FIRST = ["Aarav", "Maya", "Jordan", "Priya", "Ethan", "Sofia", "Marcus", "Chloe", "Daniel", "Aisha",
         "Kevin", "Hannah", "Luis", "Grace", "Omar", "Emily", "Ryan", "Nina", "Tyler", "Leah",
         "Jason", "Fatima", "Brandon", "Olivia", "Chris", "Zoe", "Andre", "Megan", "Samir", "Rachel",
         "Wei", "Isabel", "Noah", "Ananya", "Caleb", "Jasmine", "Victor", "Lauren", "Hiro", "Brooke",
         "Diego", "Kayla", "Arjun", "Natalie", "Sean", "Imani", "Paul", "Elena", "Raj", "Claire",
         "Mateo", "Tessa", "Kwame", "Lily", "Evan", "Sana", "Derek", "Mei", "Julian", "Ava"]
LAST = ["Patel", "Chen", "Lee", "Shah", "Johnson", "Martinez", "Williams", "Nguyen", "Kim", "Okafor",
        "Brown", "Garcia", "Davis", "Singh", "Thompson", "Rodriguez", "Wilson", "Park", "Anderson", "Ali",
        "Taylor", "Moore", "Jackson", "Hernandez", "Clark", "Lewis", "Walker", "Hall", "Young", "Allen",
        "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Mitchell", "Roberts",
        "Iyer", "Tanaka", "Mensah", "Rossi", "Cohen", "Reddy", "Kowalski", "Haddad", "Silva", "Murphy"]

# (major, college, degree_level_weights)
MAJORS = [
    ("Computer Science", "College of Computing", "BS"),
    ("Computer Science", "College of Computing", "MS"),
    ("Computer Engineering", "College of Engineering", "BS"),
    ("Electrical Engineering", "College of Engineering", "BS"),
    ("Mechanical Engineering", "College of Engineering", "BS"),
    ("Aerospace Engineering", "College of Engineering", "BS"),
    ("Industrial Engineering", "College of Engineering", "BS"),
    ("Chemical and Biomolecular Engineering", "College of Engineering", "BS"),
    ("Biomedical Engineering", "College of Engineering", "BS"),
    ("Civil Engineering", "College of Engineering", "BS"),
    ("Business Administration", "Scheller College of Business", "BS"),
    ("Business Administration", "Scheller College of Business", "MBA"),
    ("Economics", "Ivan Allen College of Liberal Arts", "BS"),
    ("Public Policy", "Ivan Allen College of Liberal Arts", "BS"),
    ("Industrial Design", "College of Design", "BS"),
    ("Architecture", "College of Design", "BS"),
    ("Mathematics", "College of Sciences", "BS"),
    ("Physics", "College of Sciences", "BS"),
    ("Neuroscience", "College of Sciences", "BS"),
    ("Biology", "College of Sciences", "BS"),
    ("Analytics", "College of Lifetime Learning", "MS"),
]
MAJOR_WEIGHTS = [16, 6, 7, 6, 9, 6, 9, 5, 5, 4, 7, 3, 3, 2, 2, 2, 2, 1, 2, 2, 3]

CS_THREADS = ["Intelligence", "Devices", "Info Internetworks", "Systems & Architecture",
              "Theory", "Media", "People", "Modeling & Simulation", "Cybersecurity & Privacy"]
PROGRAMS = ["CREATE-X", "VIP", "Co-op", "Internship Program", "Grand Challenges", "Study Abroad",
            "Honors Program", "Research (UROP)"]
ACTIVITIES = ["RoboJackets", "HackGT / Hexlabs", "SGA", "Greek life", "Marching Band", "Club sports",
              "Startup Exchange", "Women in Engineering", "Society of Hispanic Professional Engineers",
              "National Society of Black Engineers", "Grand Challenges LLC", "Solar Racing",
              "Big Data Big Impact", "Investment Club", "Habitat for Humanity", "Ramblin' Rafting"]

# industry -> list of (employer, [titles])
EMPLOYERS = {
    "Software": [("Google", ["Software Engineer", "Senior Software Engineer", "Engineering Manager", "Product Manager"]),
                 ("Microsoft", ["Software Engineer", "Program Manager", "Principal Engineer"]),
                 ("Amazon", ["SDE II", "Senior PM", "Solutions Architect"]),
                 ("Salesforce", ["Software Engineer", "Product Manager"]),
                 ("Mailchimp", ["Software Engineer", "Design Lead"]),
                 ("Apple", ["Hardware Engineer", "Software Engineer"])],
    "Fintech": [("Stripe", ["Software Engineer", "Product Manager, Payments"]),
                ("Global Payments", ["Data Scientist", "Engineering Manager"]),
                ("Fiserv", ["Software Engineer", "Product Owner"]),
                ("Capital One", ["Data Engineer", "Senior Associate"]),
                ("Goldman Sachs", ["Strats Associate", "Vice President"])],
    "Aerospace": [("Lockheed Martin", ["Systems Engineer", "Flight Test Engineer"]),
                  ("Delta Air Lines", ["Operations Research Analyst", "Engineering Manager, Tech Ops"]),
                  ("Boeing", ["Structures Engineer", "Program Manager"]),
                  ("NASA", ["Aerospace Engineer", "Research Engineer"]),
                  ("Gulfstream", ["Design Engineer"])],
    "Logistics & Retail": [("UPS", ["Industrial Engineer", "Operations Manager"]),
                           ("The Home Depot", ["Software Engineer", "Supply Chain Analyst", "Product Manager"]),
                           ("Manhattan Associates", ["Consultant", "Software Engineer"]),
                           ("Coca-Cola", ["Brand Manager", "Supply Chain Manager"])],
    "Energy & Climate": [("Southern Company", ["Power Systems Engineer", "Analyst"]),
                         ("Georgia Power", ["Distribution Engineer"]),
                         ("Voltaic Labs (startup)", ["Founder & CEO", "Founding Engineer"]),
                         ("CarbonLoop (startup)", ["Co-founder", "Head of Engineering"])],
    "Healthcare & Biotech": [("Emory Healthcare", ["Clinical Data Analyst", "Biomedical Engineer"]),
                             ("Medtronic", ["R&D Engineer", "Quality Engineer"]),
                             ("Boston Scientific", ["R&D Engineer", "Product Manager"]),
                             ("PulseGrid Health (startup)", ["Founder", "ML Engineer"])],
    "Consulting": [("Deloitte", ["Consultant", "Senior Manager"]),
                   ("McKinsey & Company", ["Associate", "Engagement Manager"]),
                   ("Accenture", ["Technology Consultant", "Manager"])],
    "Venture & Startups": [("Atlanta Tech Ventures (fictional)", ["Partner", "Principal"]),
                           ("Peachtree Seed Fund (fictional)", ["Partner"]),
                           ("BuzzStack (startup)", ["Founder & CEO", "CTO"]),
                           ("Relay Robotics Co (startup)", ["Co-founder", "Robotics Engineer"])],
    "Research & Academia": [("Georgia Tech Research Institute", ["Research Engineer", "Senior Research Scientist"]),
                            ("Georgia Tech", ["Assistant Professor", "Research Scientist"]),
                            ("CDC", ["Data Scientist", "Health Scientist"])],
    "Architecture & Design": [("Gensler", ["Architect", "Design Director"]),
                              ("IDEO", ["Industrial Designer", "Design Lead"])],
}
INDUSTRY_WEIGHTS = {"Software": 22, "Fintech": 10, "Aerospace": 10, "Logistics & Retail": 10,
                    "Energy & Climate": 7, "Healthcare & Biotech": 8, "Consulting": 9,
                    "Venture & Startups": 6, "Research & Academia": 7, "Architecture & Design": 3}

# city, state, country, lat, lng, weight
CITIES = [
    ("Atlanta", "GA", "US", 33.7490, -84.3880, 34), ("San Francisco", "CA", "US", 37.7749, -122.4194, 8),
    ("Seattle", "WA", "US", 47.6062, -122.3321, 6), ("New York", "NY", "US", 40.7128, -74.0060, 7),
    ("Austin", "TX", "US", 30.2672, -97.7431, 4), ("Washington", "DC", "US", 38.9072, -77.0369, 4),
    ("Boston", "MA", "US", 42.3601, -71.0589, 3), ("Chicago", "IL", "US", 41.8781, -87.6298, 3),
    ("Houston", "TX", "US", 29.7604, -95.3698, 3), ("Dallas", "TX", "US", 32.7767, -96.7970, 3),
    ("Charlotte", "NC", "US", 35.2271, -80.8431, 3), ("Raleigh", "NC", "US", 35.7796, -78.6382, 2),
    ("Huntsville", "AL", "US", 34.7304, -86.5861, 2), ("Savannah", "GA", "US", 32.0809, -81.0912, 2),
    ("Los Angeles", "CA", "US", 34.0522, -118.2437, 3), ("Denver", "CO", "US", 39.7392, -104.9903, 2),
    ("London", "", "UK", 51.5074, -0.1278, 1), ("Bengaluru", "", "IN", 12.9716, 77.5946, 1),
    ("Singapore", "", "SG", 1.3521, 103.8198, 1),
]

INTERESTS = ["climbing", "running", "F1", "robotics", "AI policy", "startups", "angel investing",
             "photography", "cooking", "soccer", "chess", "music production", "hiking", "volunteering",
             "board games", "space", "sustainability", "college football", "podcasts", "travel"]
OPEN_TO = ["mentoring students", "giving career advice", "hiring", "being hired", "investing",
           "meeting people new to my city", "speaking to student orgs", "cofounding"]


def wchoice(items, weights):
    return random.choices(items, weights=weights, k=1)[0]


def neighborhood_coords(lat, lng):
    """Jitter within ~3 km, then round to 2 decimals (~1.1 km) = neighborhood-level precision."""
    return round(lat + random.uniform(-0.03, 0.03), 2), round(lng + random.uniform(-0.03, 0.03), 2)


def pick_job(class_year):
    industry = wchoice(list(INDUSTRY_WEIGHTS), list(INDUSTRY_WEIGHTS.values()))
    employer, titles = random.choice(EMPLOYERS[industry])
    title = random.choice(titles)
    if class_year < 2005 and random.random() < 0.4:
        title = random.choice(["Director", "Vice President", "Chief Technology Officer", "Managing Director",
                               "Senior Director"]) + (", " + industry if random.random() < 0.3 else "")
    return industry, employer, title


def pick_programs(major):
    progs = [p for p in PROGRAMS if random.random() < (0.25 if p in ("Co-op", "VIP", "Internship Program") else 0.08)]
    threads = random.sample(CS_THREADS, 2) if major == "Computer Science" else []
    acts = random.sample(ACTIVITIES, k=random.choice([0, 1, 1, 2, 2, 3]))
    return progs, threads, acts


def make_name():
    return random.choice(FIRST), random.choice(LAST)


def gen_alumni(n):
    rows, seen = [], set()
    for i in range(n):
        first, last = make_name()
        major, college, degree = wchoice(MAJORS, MAJOR_WEIGHTS)
        class_year = random.randint(1978, 2026)
        if degree in ("MS", "MBA"):
            class_year = max(class_year, 1990)
        industry, employer, title = pick_job(class_year)
        city = wchoice(CITIES, [c[5] for c in CITIES])
        progs, threads, acts = pick_programs(major)
        cid = f"AA{100000 + i}"
        handle = f"{first.lower()}.{last.lower()}{random.randint(1, 99)}"
        # Messy-on-purpose fields a real export has:
        employer_out = employer if random.random() > 0.08 else ""          # some missing employers
        title_out = title if employer_out else ""
        email_on_file = f"{handle}@example.com" if random.random() > 0.12 else ""
        emfl_alias = f"{handle}@alumni.example.gatech.test" if random.random() > 0.35 else ""
        rows.append({
            "constituent_id": cid,
            "first_name": first,
            "last_name": last,
            "preferred_name": first if random.random() > 0.15 else "",
            "degree": degree,
            "major": major,
            "college": college,
            "class_year": class_year,
            "gt_programs": ";".join(progs),
            "cs_threads": ";".join(threads),
            "activities": ";".join(acts),
            "employer": employer_out,
            "job_title": title_out,
            "industry": industry if employer_out else "",
            "city": city[0],
            "state": city[1],
            "country": city[2],
            "email_on_file": email_on_file,
            "emfl_alias": emfl_alias,
            # Flags the import MUST respect:
            "do_not_contact": "Y" if random.random() < 0.05 else "N",
            "directory_opt_out": "Y" if random.random() < 0.04 else "N",
            "deceased": "Y" if (class_year < 1990 and random.random() < 0.06) else "N",
            "last_updated": (date(2026, 10, 1) - timedelta(days=random.randint(0, 1800))).isoformat(),
        })
        seen.add((first, last, class_year))
    # A few deliberate duplicates (same person, two records) to exercise dedupe
    for r in random.sample(rows, 6):
        dup = dict(r)
        dup["constituent_id"] = f"AA{900000 + random.randint(0, 99999)}"
        dup["employer"] = ""
        dup["job_title"] = ""
        dup["last_updated"] = "2019-05-01"
        rows.append(dup)
    random.shuffle(rows)
    return rows


def gen_members(n, alumni_rows):
    members = []
    # 1) Some alumni from the AA export who have CLAIMED their profile (same person -> must dedupe/merge)
    claimable = [r for r in alumni_rows if r["deceased"] == "N" and r["directory_opt_out"] == "N"
                 and r["email_on_file"] and r["employer"]]
    for r in random.sample(claimable, min(18, len(claimable))):
        city = next(c for c in CITIES if c[0] == r["city"])
        lat, lng = neighborhood_coords(city[3], city[4])
        members.append(member_record(
            first=r["preferred_name"] or r["first_name"], last=r["last_name"], roles=["alum"],
            class_year=r["class_year"], major=r["major"], degree=r["degree"],
            programs=r["gt_programs"].split(";") if r["gt_programs"] else [],
            threads=r["cs_threads"].split(";") if r["cs_threads"] else [],
            activities=r["activities"].split(";") if r["activities"] else [],
            industry=r["industry"], employer=r["employer"], title=r["job_title"],
            city=city, lat=lat, lng=lng, login_email=r["email_on_file"], aa_id=r["constituent_id"]))
    # 2) Current students (never in the AA export; only appear because they signed up)
    for _ in range(int(n * 0.4)):
        first, last = make_name()
        major, college, degree = wchoice(MAJORS[:-1], MAJOR_WEIGHTS[:-1])
        progs, threads, acts = pick_programs(major)
        lat, lng = neighborhood_coords(33.7756, -84.3963)  # GT campus
        members.append(member_record(
            first=first, last=last, roles=["student"], class_year=random.randint(2027, 2030), major=major,
            degree="BS", programs=progs, threads=threads, activities=acts, industry="", employer="",
            title="Student", city=CITIES[0], lat=lat, lng=lng,
            login_email=f"{first.lower()}{random.randint(1, 999)}@student.example.gatech.test"))
    # 3) New alumni not in the AA export yet, faculty/staff, and lifetime learners
    extra = n - len(members)
    for i in range(max(extra, 0)):
        first, last = make_name()
        kind = random.choice(["alum", "alum", "faculty", "staff", "lifetime_learner"])
        major, college, degree = wchoice(MAJORS, MAJOR_WEIGHTS)
        cy = random.randint(2023, 2026) if kind == "alum" else (random.randint(1995, 2015) if kind != "lifetime_learner" else 2026)
        industry, employer, title = pick_job(cy)
        if kind in ("faculty", "staff"):
            industry, employer = "Research & Academia", "Georgia Tech"
            title = "Assistant Professor" if kind == "faculty" else random.choice(["Program Director", "Career Advisor"])
        if kind == "lifetime_learner":
            major, degree = random.choice([("Analytics", "MS"), ("Computer Science", "MS")])
        city = wchoice(CITIES, [c[5] for c in CITIES])
        lat, lng = neighborhood_coords(city[3], city[4])
        progs, threads, acts = pick_programs(major)
        members.append(member_record(
            first=first, last=last, roles=[kind], class_year=cy, major=major, degree=degree, programs=progs,
            threads=threads, activities=acts, industry=industry, employer=employer, title=title, city=city,
            lat=lat, lng=lng, login_email=f"{first.lower()}.{last.lower()}{i}@example.org"))
    # One student with a registrar confidentiality flag, to test FERPA handling
    for m in members:
        if "student" in m["roles"]:
            m["ferpa_restricted"] = True
            break
    return members


def member_record(first, last, roles, class_year, major, degree, programs, threads, activities, industry,
                  employer, title, city, lat, lng, login_email, aa_id=None):
    is_student = "student" in roles
    open_to = random.sample(["being hired", "giving career advice", "cofounding", "meeting people new to my city"],
                            k=2) if is_student else random.sample(OPEN_TO, k=random.randint(1, 3))
    interests = random.sample(INTERESTS, k=random.randint(2, 4))
    role_text = f"{title} at {employer}" if employer and not is_student else f"{major} student"
    program_text = f" {', '.join(programs[:2])} alum." if programs and not is_student else (
        f" Involved in {', '.join(programs[:2])}." if programs else "")
    summary = f"{role_text}, {city[0]}.{program_text} Into {interests[0]} and {interests[1]}."
    return {
        "id": str(uuid.UUID(int=random.getrandbits(128))),
        "aa_constituent_id": aa_id,
        "login_email": login_email,  # PRIVATE: never returned by public APIs
        "first_name": first,
        "last_name": last,
        "roles": roles,
        "class_year": class_year,
        "degree": degree,
        "major": major,
        "gt_programs": [p for p in programs if p],
        "cs_threads": [t for t in threads if t],
        "activities": [a for a in activities if a],
        "industry": industry,
        "employer": employer,
        "job_title": title,
        "city": city[0], "state": city[1], "country": city[2],
        "lat": lat, "lng": lng,
        "summary": summary,
        "summary_approved": True,
        "open_to": open_to,
        "interests": interests,
        "contact_channel": random.choice(["email", "email", "sms"]),
        "status": "claimed",
        "ferpa_restricted": False,  # if True (students only): hide the profile entirely
    }


def gen_requests(members):
    alumni = [m for m in members if "alum" in m["roles"]]
    students = [m for m in members if "student" in m["roles"]]
    out = []
    states = ["sent", "replied", "not_interested", "no_response", "replied", "sent"]
    for st in states:
        s, a = random.choice(students), random.choice(alumni)
        out.append({
            "id": str(uuid.UUID(int=random.getrandbits(128))),
            "sender_id": s["id"],
            "recipient_profile_id": a["id"],
            "goal_text": f"Advice on breaking into {a['industry'] or 'industry'} roles",
            "message": (f"Hi {a['first_name']}, I'm {s['first_name']}, a {s['major']} student at Georgia Tech. "
                        f"I'm exploring {a['industry'] or 'your field'} and would really value 15 minutes of your "
                        f"advice on how you got to {a['employer']}. Would you be open to a short call?"),
            "status": st,
            "sent_at": "2026-11-08T15:00:00Z",
            "reminder_sent": st == "no_response",
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alumni", type=int, default=600)
    ap.add_argument("--members", type=int, default=60)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    random.seed(args.seed)
    OUT.mkdir(parents=True, exist_ok=True)

    alumni = gen_alumni(args.alumni)
    with open(OUT / "alumni_association_export.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(alumni[0].keys()))
        w.writeheader()
        w.writerows(alumni)

    members = gen_members(args.members, alumni)
    (OUT / "claimed_members.json").write_text(json.dumps(members, indent=2))
    (OUT / "intro_requests.json").write_text(json.dumps(gen_requests(members), indent=2))
    (OUT / "cities.json").write_text(json.dumps(
        [{"city": c[0], "state": c[1], "country": c[2], "lat": c[3], "lng": c[4]} for c in CITIES], indent=2))

    excluded = sum(1 for r in alumni if "Y" in (r["deceased"], r["directory_opt_out"]))
    print(f"alumni_association_export.csv: {len(alumni)} rows ({excluded} must be excluded on import, 6 duplicates)")
    print(f"claimed_members.json: {len(members)} members")
    print("intro_requests.json, cities.json written")


if __name__ == "__main__":
    main()
