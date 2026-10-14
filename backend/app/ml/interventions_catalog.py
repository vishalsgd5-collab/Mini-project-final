CATALOG = [
    {
        "id": "twenty_twenty",
        "title": "20-20-20 Gaze Reset",
        "duration_sec": 25,
        "category": "eyes",
        "cue": "Look 20 feet away for 20 seconds.",
        "steps": [
            "Sit tall and unfocus from the screen.",
            "Find a distant point about 20 feet away.",
            "Hold a soft gaze for 20 seconds.",
            "Blink slowly three times, then return.",
        ],
    },
    {
        "id": "palming",
        "title": "Warm Palming",
        "duration_sec": 40,
        "category": "eyes",
        "cue": "Cup warm palms over closed eyes.",
        "steps": [
            "Rub your palms together until they feel warm.",
            "Close your eyes and cup palms over them without pressure.",
            "Breathe slowly into the darkness.",
            "Open eyes gradually toward ambient light.",
        ],
    },
    {
        "id": "blink_gym",
        "title": "Blink Gym",
        "duration_sec": 30,
        "category": "eyes",
        "cue": "Twenty slow, complete blinks.",
        "steps": [
            "Close both eyelids fully — lashes should meet.",
            "Hold closed for one second.",
            "Open and repeat 20 times.",
            "Finish with three long blinks.",
        ],
    },
    {
        "id": "neck_roll",
        "title": "Neck & Shoulder Unlock",
        "duration_sec": 50,
        "category": "posture",
        "cue": "Slow rolls, then shoulder drops.",
        "steps": [
            "Drop your shoulders away from your ears.",
            "Gently roll the neck clockwise, then reverse.",
            "Interlace fingers, stretch arms forward, round the upper back.",
            "Open the chest, squeeze shoulder blades together.",
        ],
    },
    {
        "id": "posture_reset",
        "title": "Posture Reset",
        "duration_sec": 35,
        "category": "posture",
        "cue": "Stack ears over shoulders over hips.",
        "steps": [
            "Plant both feet on the floor.",
            "Lengthen the crown of your head toward the ceiling.",
            "Tuck the chin slightly, open the chest.",
            "Hold the stacked posture for three slow breaths.",
        ],
    },
    {
        "id": "box_breathing",
        "title": "Box Breathing",
        "duration_sec": 64,
        "category": "breath",
        "cue": "In 4 · hold 4 · out 4 · hold 4.",
        "steps": [
            "Inhale through the nose for four counts.",
            "Hold the breath for four counts.",
            "Exhale through the mouth for four counts.",
            "Hold empty for four counts. Repeat four rounds.",
        ],
    },
    {
        "id": "hydration",
        "title": "Hydration Pause",
        "duration_sec": 30,
        "category": "body",
        "cue": "Stand, sip water, look away.",
        "steps": [
            "Stand up from the chair.",
            "Take 6–8 slow sips of water.",
            "Roll your shoulders while you drink.",
            "Sit only after you have looked at a far wall.",
        ],
    },
    {
        "id": "micro_walk",
        "title": "Micro Walk",
        "duration_sec": 75,
        "category": "body",
        "cue": "Walk for a little over a minute.",
        "steps": [
            "Stand and walk to another room or a window.",
            "Keep a natural pace — no phone.",
            "At the window, look at the farthest object you can see.",
            "Return and sit with a lengthened spine.",
        ],
    },
]


def get_intervention(arm_id: str) -> dict:
    for item in CATALOG:
        if item["id"] == arm_id:
            return item
    return CATALOG[0]


ARM_IDS = [item["id"] for item in CATALOG]
