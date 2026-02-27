/**
 * Seed script voor ResearchTemplates
 * Draai na prisma migrate: npx tsx scripts/seed-research-templates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DOCUMENTARY_TEMPLATE = {
  "research_brief": {
    "video_metadata": {
      "working_title": "",
      "topic_one_sentence": "",
      "primary_emotion_to_evoke": "",
      "target_length_minutes": ""
    },
    "protagonist": {
      "_instructions": "The main character of your story - can be hero, villain, or antihero. Fill with verified facts only.",
      "full_name": "",
      "age_at_time_of_events": "",
      "occupation_or_status": "",
      "location": "",
      "physical_description": "What did they look like? Any distinctive features?",
      "background_brief": "Where did they come from? What shaped them?",
      "psychological_profile": "What drove them? Motivations, obsessions, weaknesses?",
      "mundane_humanizing_detail": "A small, relatable detail that makes them feel real",
      "nickname_or_alias_if_any": ""
    },
    "victims_or_targets": {
      "_instructions": "People affected by the protagonist's actions. Include 3-5 key figures minimum.",
      "individuals": [
        {
          "name": "",
          "role_or_profession": "",
          "connection_to_protagonist": "",
          "specific_impact_suffered": "",
          "humanizing_detail": "",
          "any_quotes_from_them": ""
        }
      ],
      "collective_victims_if_applicable": {
        "group_description": "",
        "total_number_affected": "",
        "range_of_impacts": ""
      }
    },
    "supporting_characters": {
      "_instructions": "Investigators, accomplices, witnesses, family members - anyone who plays a significant role.",
      "characters": [
        {
          "name": "",
          "role_in_story": "",
          "key_actions_they_took": "",
          "notable_quotes": ""
        }
      ]
    },
    "chronological_timeline": {
      "_instructions": "List every significant event with exact dates when possible. This is the backbone of your script.",
      "events": [
        {
          "date": "Be as specific as possible (Month Year minimum)",
          "location": "",
          "what_happened": "Describe the event factually",
          "significance": "Why does this matter to the story?",
          "source": "Where did you find this information?"
        }
      ]
    },
    "cold_open_material": {
      "_instructions": "The most dramatic moment of your story - this will be your hook.",
      "the_moment": {
        "exact_date": "",
        "exact_location": "",
        "what_is_happening": "Describe the scene cinematically",
        "what_makes_it_shocking": "",
        "ironic_twist": "What contradiction or surprise exists here?"
      },
      "central_mystery_question": "The question that will hook viewers and be answered by the end"
    },
    "the_method": {
      "_instructions": "How did the protagonist do what they did? Technical details for a general audience.",
      "technique_name": "",
      "step_by_step_explanation": ["Step 1: ", "Step 2: ", "Step 3: "],
      "why_it_worked": "What vulnerability or flaw did they exploit?",
      "technical_terms_to_explain": [{ "term": "", "simple_explanation": "" }],
      "scale_of_operation": "Numbers, duration, scope"
    },
    "systemic_failure": {
      "_instructions": "What institution, system, or authority failed to prevent this?",
      "institution_that_failed": "",
      "how_they_were_supposed_to_protect": "",
      "why_they_failed": "",
      "specific_incompetence_examples": [""],
      "ironic_details_about_the_failure": ""
    },
    "the_investigation": {
      "_instructions": "How was the protagonist caught? The cat-and-mouse section.",
      "investigating_agency": "",
      "operation_code_name_if_any": "",
      "when_investigation_began": "",
      "initial_wrong_assumptions": "",
      "key_breakthrough": "",
      "the_fatal_mistake": "",
      "how_long_until_caught": ""
    },
    "the_confrontation": {
      "_instructions": "The arrest, raid, or climactic moment when everything collapses.",
      "date_and_time": "",
      "location": "",
      "scene_description": "",
      "protagonist_reaction": "",
      "ironic_or_absurd_details": ""
    },
    "legal_resolution": {
      "_instructions": "Court proceedings, sentencing, and aftermath.",
      "charges_filed": [],
      "trial_date_if_applicable": "",
      "notable_court_testimony": "",
      "victim_impact_statements": [{ "from_whom": "", "key_quote": "", "emotional_impact": "" }],
      "sentence_received": "",
      "protagonist_statement_in_court": "",
      "current_status": ""
    },
    "verified_quotes": {
      "_instructions": "Direct quotes you can use in the script. ONLY verified from reliable sources.",
      "quotes": [{ "speaker": "", "exact_quote": "", "context": "", "source": "" }]
    },
    "statistics_and_numbers": {
      "_instructions": "Concrete numbers add credibility and impact. Verify all figures.",
      "figures": [{ "number": "", "what_it_represents": "", "source": "" }]
    },
    "ironic_and_absurd_details": {
      "_instructions": "Small details that highlight contradictions or dark humor.",
      "details": [""]
    },
    "sensory_and_environmental_details": {
      "_instructions": "Details that help viewers visualize scenes.",
      "key_locations": [{ "location_name": "", "physical_description": "", "atmosphere": "", "relevant_details": "" }]
    },
    "universal_stakes": {
      "_instructions": "Why should viewers care? How does this connect to their lives?",
      "why_this_matters_to_viewer": "",
      "how_this_could_happen_to_them": "",
      "lesson_or_warning": "",
      "current_relevance": ""
    },
    "sources": {
      "_instructions": "List ALL sources.",
      "primary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }],
      "secondary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }]
    },
    "next_video_hook": {
      "_instructions": "Tease for your next video.",
      "next_topic": "",
      "connection_to_current_video": "",
      "teaser_line": ""
    },
    "notes_and_gaps": {
      "_instructions": "Things you still need to research or verify.",
      "unverified_claims": [],
      "information_gaps": [],
      "questions_to_answer": []
    }
  }
};

const TRENDING_TEMPLATE = {
  "research_brief": {
    "video_metadata": {
      "working_title": "",
      "topic_one_sentence": "",
      "primary_emotion_to_evoke": "",
      "target_length_minutes": "",
      "trending_angle": "What makes this topic current/urgent right now?"
    },
    "key_facts": {
      "_instructions": "Core facts about the trending topic. All must be verified.",
      "what_happened": "",
      "when": "",
      "where": "",
      "who_is_involved": [],
      "why_it_matters": "",
      "current_status": ""
    },
    "timeline_of_events": {
      "_instructions": "Chronological breakdown of events.",
      "events": [{ "date": "", "what_happened": "", "significance": "", "source": "" }]
    },
    "key_players": {
      "_instructions": "People and organizations involved.",
      "players": [{ "name": "", "role": "", "stance_or_position": "", "notable_quotes": "", "public_reaction": "" }]
    },
    "multiple_perspectives": {
      "_instructions": "Different viewpoints on the topic for balanced coverage.",
      "perspectives": [{ "viewpoint": "", "key_arguments": "", "supporters": "", "criticism": "" }]
    },
    "statistics_and_data": {
      "figures": [{ "number": "", "what_it_represents": "", "source": "" }]
    },
    "viral_moments": {
      "_instructions": "Specific moments, clips, or quotes that went viral.",
      "moments": [{ "description": "", "platform": "", "impact": "", "url_if_available": "" }]
    },
    "expert_analysis": {
      "experts": [{ "name": "", "credentials": "", "analysis": "", "source": "" }]
    },
    "viewer_connection": {
      "why_viewer_should_care": "",
      "how_it_affects_them": "",
      "call_to_action_or_takeaway": ""
    },
    "sources": {
      "primary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }],
      "secondary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }]
    },
    "notes_and_gaps": {
      "unverified_claims": [],
      "information_gaps": [],
      "questions_to_answer": []
    }
  }
};

const AI_TEMPLATE = {
  "research_brief": {
    "video_metadata": {
      "working_title": "",
      "topic_one_sentence": "",
      "primary_emotion_to_evoke": "",
      "target_length_minutes": ""
    },
    "core_topic": {
      "_instructions": "The main subject of the video. Provide comprehensive background.",
      "subject": "",
      "background_context": "",
      "why_its_interesting": "",
      "target_audience": ""
    },
    "key_points": {
      "_instructions": "Main points the video should cover, in logical order.",
      "points": [{ "title": "", "explanation": "", "supporting_evidence": "", "source": "" }]
    },
    "narrative_arc": {
      "hook": "What grabs attention in the first 10 seconds?",
      "build_up": "How does the story develop?",
      "climax": "What is the most impactful moment?",
      "resolution": "How does it conclude?",
      "final_thought": "What should viewers take away?"
    },
    "visual_opportunities": {
      "_instructions": "Scenes that would be visually compelling for AI generation.",
      "scenes": [{ "description": "", "mood": "", "visual_style_notes": "" }]
    },
    "statistics_and_facts": {
      "figures": [{ "number": "", "what_it_represents": "", "source": "" }]
    },
    "quotes_to_use": {
      "quotes": [{ "speaker": "", "quote": "", "context": "", "source": "" }]
    },
    "sources": {
      "primary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }],
      "secondary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }]
    },
    "notes_and_gaps": {
      "unverified_claims": [],
      "information_gaps": [],
      "questions_to_answer": []
    }
  }
};

const COMPILATION_TEMPLATE = {
  "research_brief": {
    "video_metadata": {
      "working_title": "",
      "topic_one_sentence": "",
      "primary_emotion_to_evoke": "",
      "target_length_minutes": "",
      "compilation_format": "Top X list / chronological / thematic grouping"
    },
    "items": {
      "_instructions": "Each item in the compilation with enough detail for narration between clips.",
      "entries": [
        {
          "rank_or_order": "",
          "title": "",
          "description": "",
          "key_facts": "",
          "why_its_notable": "",
          "transition_to_next": "How to connect to the next item",
          "suggested_clip_search": "What to search for as B-roll"
        }
      ]
    },
    "introduction": {
      "hook": "",
      "context_setting": "",
      "what_viewer_will_learn": ""
    },
    "conclusion": {
      "summary": "",
      "surprising_takeaway": "",
      "call_to_action": ""
    },
    "statistics_and_facts": {
      "figures": [{ "number": "", "what_it_represents": "", "source": "" }]
    },
    "sources": {
      "primary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }],
      "secondary_sources": [{ "type": "", "title": "", "url_or_reference": "", "key_information_obtained": "" }]
    },
    "notes_and_gaps": {
      "unverified_claims": [],
      "information_gaps": [],
      "questions_to_answer": []
    }
  }
};

async function main() {
  console.log('Seeding research templates...');

  const templates = [
    { name: 'Documentary Default', videoType: 'documentary', template: JSON.stringify(DOCUMENTARY_TEMPLATE, null, 2), isDefault: true },
    { name: 'Trending Default', videoType: 'trending', template: JSON.stringify(TRENDING_TEMPLATE, null, 2), isDefault: true },
    { name: 'AI Default', videoType: 'ai', template: JSON.stringify(AI_TEMPLATE, null, 2), isDefault: true },
    { name: 'Spokesperson AI Default', videoType: 'spokesperson_ai', template: JSON.stringify(AI_TEMPLATE, null, 2), isDefault: true },
    { name: 'Compilation Default', videoType: 'compilation', template: JSON.stringify(COMPILATION_TEMPLATE, null, 2), isDefault: true },
    { name: 'Spokesperson Default', videoType: 'spokesperson', template: JSON.stringify(TRENDING_TEMPLATE, null, 2), isDefault: true },
  ];

  for (const t of templates) {
    // Upsert: als er al een default bestaat voor dit videoType, skip
    const existing = await prisma.researchTemplate.findFirst({
      where: { videoType: t.videoType, isDefault: true },
    });
    if (!existing) {
      await prisma.researchTemplate.create({ data: t });
      console.log(`  ✓ ${t.name} aangemaakt`);
    } else {
      console.log(`  - ${t.name} bestaat al, overgeslagen`);
    }
  }

  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
