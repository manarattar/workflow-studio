"""
Two realistic sample inboxes to run workflows on.

Each item carries the outcome the dataset's reference policy (its `template`
description) should produce, so a run can report accuracy, not just a path.
All messages are invented; names, companies and numbers are fictional.
"""

ACCOUNTS_PAYABLE = {
    "id": "accounts_payable",
    "name": "Accounts payable inbox",
    "blurb": "Supplier invoices: some genuine, some fraud, some incomplete",
    "fields": {
        "sender": "text",
        "subject": "text",
        "body": "text",
        "amount_eur": "number",
        "po_number": "text",
    },
    # present on every item, so checking whether they are empty is pointless
    "always_filled": ["sender", "subject", "body", "amount_eur"],
    # the only facts a write step may use, so drafts can't invent details
    "knowledge": [
        "Company: Northwind Retail B.V., Amsterdam. Messages are sent by the Accounts Payable team.",
        "Every invoice must quote a purchase order number in the format PO-12345.",
        "Suppliers without a purchase order number can request one from their contact at Northwind.",
        "Invoices with a valid purchase order are paid within 30 days of receipt.",
        "Invoices can be sent to invoices@northwind-retail.example.",
    ],
    "outcomes": {
        "pay_automatically": "Genuine invoice, has a purchase order, small enough to pay without approval",
        "manager_approval": "Genuine invoice with a purchase order, but large enough to need a manager",
        "request_missing_info": "Genuine invoice that is missing information, so the supplier is asked for it",
        "block_fraud": "Looks like invoice fraud: changed bank details, pressure to pay, or impersonation",
    },
    "template": (
        "Process incoming invoice emails. If an email looks like fraud - for example the "
        "supplier suddenly asks us to pay into a new bank account, or someone pressures us to "
        "pay urgently and skip the usual checks - block it. If there is no purchase order "
        "number, write the supplier a short, polite email asking for it. Invoices over "
        "EUR 1,000 need manager approval; everything else can be paid automatically."
    ),
    "items": [
        {
            "id": "ap-01",
            "sender": "billing@greenleaf-office.nl",
            "subject": "Invoice 2026-0412 - office supplies September",
            "body": "Dear finance team, please find attached invoice 2026-0412 for the office supplies delivered on 12 September. Payment terms: 30 days, to our usual account. Kind regards, Greenleaf Office Supplies",
            "amount_eur": 284.50,
            "po_number": "PO-88213",
            "expected": "pay_automatically",
        },
        {
            "id": "ap-02",
            "sender": "accounts@northbridge-it.com",
            "subject": "Invoice NB-7731 - laptop fleet refresh",
            "body": "Hello, attached is invoice NB-7731 for the 14 laptops delivered last week under your purchase order. Please process within our standard 30-day terms. Best, Northbridge IT",
            "amount_eur": 18450.00,
            "po_number": "PO-88150",
            "expected": "manager_approval",
        },
        {
            "id": "ap-03",
            "sender": "finance@greenleaf-office.nl",
            "subject": "URGENT: updated bank details for all payments",
            "body": "Dear customer, due to an audit our bank account has changed. Please make all outstanding payments, including invoice 2026-0412, to our new account NL91 ABNA 0417 1643 00 from today. Do not use the old account anymore. Please confirm once paid.",
            "amount_eur": 284.50,
            "po_number": "PO-88213",
            "expected": "block_fraud",
        },
        {
            "id": "ap-04",
            "sender": "invoices@brightclean-services.nl",
            "subject": "Invoice BC-2291 cleaning September",
            "body": "Good afternoon, here is our invoice for the office cleaning in September. Thank you for your continued business! BrightClean Services",
            "amount_eur": 640.00,
            "po_number": "",
            "expected": "request_missing_info",
        },
        {
            "id": "ap-05",
            "sender": "ceo.office@company-holding.net",
            "subject": "Confidential payment - needed today",
            "body": "I need you to process a confidential payment of EUR 9,800 to a new consultant today before 3pm. I am in meetings all day so do not call me, just send it and I will sign the paperwork later. Keep this between us for now.",
            "amount_eur": 9800.00,
            "po_number": "",
            "expected": "block_fraud",
        },
        {
            "id": "ap-06",
            "sender": "facturen@vanderberg-transport.nl",
            "subject": "Factuur 55120 - transport week 38",
            "body": "Geachte heer/mevrouw, bijgaand onze factuur 55120 voor de transportdiensten in week 38. Betaling graag binnen 30 dagen op het bekende rekeningnummer. Met vriendelijke groet, Van der Berg Transport",
            "amount_eur": 1320.00,
            "po_number": "PO-88177",
            "expected": "manager_approval",
        },
        {
            "id": "ap-07",
            "sender": "hello@pixelworks-design.io",
            "subject": "Invoice PW-104 - banner redesign",
            "body": "Hi! Invoice PW-104 for the web banner redesign is attached. It was a pleasure working with you, let me know if anything is unclear.",
            "amount_eur": 450.00,
            "po_number": "PO-88230",
            "expected": "pay_automatically",
        },
        {
            "id": "ap-08",
            "sender": "billing@northbridge-it.com",
            "subject": "New office address - please update your records",
            "body": "Dear customer, please note that Northbridge IT has moved to Keizersgracht 210, Amsterdam. Our bank details are unchanged. Attached is invoice NB-7790 for the monthly support contract.",
            "amount_eur": 750.00,
            "po_number": "PO-88151",
            "expected": "pay_automatically",
        },
        {
            "id": "ap-09",
            "sender": "support@northbridge-it-billing.com",
            "subject": "Payment overdue - account suspended in 24h",
            "body": "Your support contract will be suspended within 24 hours unless invoice NB-7731 is paid immediately. Due to a technical issue with our usual bank, transfer the amount to the account below instead: DE89 3704 0044 0532 0130 00.",
            "amount_eur": 18450.00,
            "po_number": "PO-88150",
            "expected": "block_fraud",
        },
        {
            "id": "ap-10",
            "sender": "accounts@stadskoffie.nl",
            "subject": "Invoice coffee machine rental Q3",
            "body": "Dear team, please find the quarterly invoice for the coffee machine rental and beans. We could not find your purchase order reference, so it is not on the invoice.",
            "amount_eur": 390.00,
            "po_number": "",
            "expected": "request_missing_info",
        },
        {
            "id": "ap-11",
            "sender": "finance@atlas-consulting.eu",
            "subject": "Invoice AC-3301 - process optimisation project, phase 2",
            "body": "Please find attached our invoice for phase 2 of the process optimisation project, as agreed in the statement of work. Payment within 30 days to the account on the invoice.",
            "amount_eur": 24000.00,
            "po_number": "PO-88099",
            "expected": "manager_approval",
        },
        {
            "id": "ap-12",
            "sender": "noreply@printshop24.nl",
            "subject": "Your invoice for order 88412",
            "body": "Thank you for your order! Your invoice for 500 business cards is attached. Order reference 88412.",
            "amount_eur": 89.95,
            "po_number": "PO-88241",
            "expected": "pay_automatically",
        },
        {
            "id": "ap-13",
            "sender": "accounts@brightclean-services.nl",
            "subject": "Change of bank - please read",
            "body": "Hello, we have switched banks. From now on please pay all BrightClean invoices to NL02 RABO 0123 4567 89. We attach a letter on our letterhead confirming the change. Invoice BC-2305 for October is attached.",
            "amount_eur": 640.00,
            "po_number": "PO-88260",
            "expected": "block_fraud",
        },
        {
            "id": "ap-14",
            "sender": "billing@cloudnest-hosting.com",
            "subject": "Invoice CN-99812 - hosting October",
            "body": "Your monthly invoice for cloud hosting (October) is available. The amount will be collected as usual. Questions? Reply to this email.",
            "amount_eur": 1080.00,
            "po_number": "",
            "expected": "request_missing_info",
        },
        {
            "id": "ap-15",
            "sender": "finance@greenleaf-office.nl",
            "subject": "Invoice 2026-0431 - printer paper",
            "body": "Dear finance team, attached is invoice 2026-0431 for the printer paper delivered on 2 October. Payment to our usual account within 30 days. Kind regards, Greenleaf Office Supplies",
            "amount_eur": 156.20,
            "po_number": "PO-88270",
            "expected": "pay_automatically",
        },
        {
            "id": "ap-16",
            "sender": "legal@atlas-consulting.eu",
            "subject": "Invoice AC-3302 - workshop facilitation",
            "body": "Attached is the invoice for the two workshop days in September, in line with the framework agreement. Standard payment terms apply.",
            "amount_eur": 3200.00,
            "po_number": "PO-88101",
            "expected": "manager_approval",
        },
    ],
}

BANK_SUPPORT = {
    "id": "bank_support",
    "name": "Bank customer support inbox",
    "blurb": "Customer messages: fraud, vulnerable customers, complaints, simple questions",
    "fields": {
        "channel": "text",
        "message": "text",
    },
    "always_filled": ["channel", "message"],
    # the only facts a write step may use, so drafts can't invent details
    "knowledge": [
        "Bank: Harbour Bank (a fictional demo bank). Replies are signed by the Customer Service team.",
        "Branch opening hours: Monday to Friday 09:00-17:30, Saturday 10:00-14:00 (Amsterdam, "
        "Rotterdam and Utrecht branches), closed on Sunday.",
        "Card spending limits: in the app go to Cards > your card > Limits, choose a daily limit "
        "and confirm with your PIN. Changes apply immediately.",
        "Standard savings account interest rate: 1.50% per year, variable.",
        "Payments abroad in euros within the EU are free; payments in other currencies cost EUR 5.",
        "A business account can be opened online at harbourbank.example/business; you need a "
        "Chamber of Commerce (KvK) registration and valid ID.",
        "The customer service phone number is 020 123 4567 (weekdays 08:00-20:00).",
    ],
    "outcomes": {
        "fraud_team_urgent": "Fraud, a scam, or a lost or stolen card - needs the fraud team immediately",
        "vulnerable_callback": "The customer seems vulnerable (elderly and confused, grieving, in financial trouble) - a person calls back",
        "complaints_team": "A complaint about the bank's service or a decision",
        "auto_reply": "A simple question answered with general information in a drafted reply",
        "general_queue": "Anything else that needs a person to act on it",
    },
    "template": (
        "Route incoming customer messages. Anything about fraud, scams or a lost or stolen card "
        "goes to the fraud team immediately. If the customer seems vulnerable - for example "
        "elderly and confused, grieving, or in serious financial trouble - schedule a callback. "
        "Complaints go to the complaints team. Simple questions that can be answered with "
        "general information get an automatic drafted reply. Everything else goes to the "
        "general queue."
    ),
    "items": [
        {
            "id": "bs-01",
            "channel": "app chat",
            "message": "I lost my debit card on the train this morning and I think someone already paid with it at a petrol station. Please block it!",
            "expected": "fraud_team_urgent",
        },
        {
            "id": "bs-02",
            "channel": "email",
            "message": "What are your opening hours on Saturday for the branch in Utrecht?",
            "expected": "auto_reply",
        },
        {
            "id": "bs-03",
            "channel": "email",
            "message": "My husband passed away last month and I don't know how to access our joint account or what I need to do. He always handled the money. I'm sorry if this is the wrong place to ask.",
            "expected": "vulnerable_callback",
        },
        {
            "id": "bs-04",
            "channel": "app chat",
            "message": "This is the third time my mortgage application has been delayed without any explanation. I am very unhappy with how this has been handled and I want this escalated.",
            "expected": "complaints_team",
        },
        {
            "id": "bs-05",
            "channel": "phone transcript",
            "message": "Someone called me saying they were from your security department and I gave them the code from my app. Now 2,400 euro is gone from my savings.",
            "expected": "fraud_team_urgent",
        },
        {
            "id": "bs-06",
            "channel": "email",
            "message": "I would like to change the address on my account to Prinsengracht 45, Amsterdam, as I moved last week.",
            "expected": "general_queue",
        },
        {
            "id": "bs-07",
            "channel": "app chat",
            "message": "How do I set a daily spending limit on my card in the app?",
            "expected": "auto_reply",
        },
        {
            "id": "bs-08",
            "channel": "email",
            "message": "I lost my job in June and now I can't pay my rent and loan this month. I don't know what to do, the letters keep coming and I can't sleep.",
            "expected": "vulnerable_callback",
        },
        {
            "id": "bs-09",
            "channel": "email",
            "message": "Goedemiddag, ik heb een sms gekregen dat mijn rekening geblokkeerd wordt als ik niet op de link klik. Ik heb erop geklikt en mijn gegevens ingevuld. Is dit echt van jullie?",
            "expected": "fraud_team_urgent",
        },
        {
            "id": "bs-10",
            "channel": "email",
            "message": "You charged me a 15 euro fee for a payment abroad that your website says is free. I want the fee refunded and I think this is unacceptable.",
            "expected": "complaints_team",
        },
        {
            "id": "bs-11",
            "channel": "phone transcript",
            "message": "Hello dear, I am 84 and my grandson usually helps me but he is away. I cannot find the button to pay my bills anymore and the screen looks different. Can somebody help me please.",
            "expected": "vulnerable_callback",
        },
        {
            "id": "bs-12",
            "channel": "app chat",
            "message": "What is the current interest rate on your standard savings account?",
            "expected": "auto_reply",
        },
        {
            "id": "bs-13",
            "channel": "email",
            "message": "Please send me an official statement of my account balance on 31 December for my tax return.",
            "expected": "general_queue",
        },
        {
            "id": "bs-14",
            "channel": "phone transcript",
            "message": "My mother is 79 and a man she met online convinced her to send him money for a medical emergency. She transferred 5,000 euro yesterday. Can you stop it?",
            "expected": "fraud_team_urgent",
        },
        {
            "id": "bs-15",
            "channel": "email",
            "message": "Ik wil graag een klacht indienen. De medewerker aan de telefoon was erg onbeleefd en heeft mijn vraag niet beantwoord.",
            "expected": "complaints_team",
        },
        {
            "id": "bs-16",
            "channel": "app chat",
            "message": "I want to open a second account for my small business next to my private account. What do I need to do?",
            "expected": "general_queue",
        },
    ],
}

DATASETS = {d["id"]: d for d in (ACCOUNTS_PAYABLE, BANK_SUPPORT)}

# only what the model may see about an item: never the expected outcome
PRIVATE_KEYS = {"id", "expected"}


def item_state(item: dict, fields: dict) -> dict:
    return {k: item.get(k) for k in fields if k not in PRIVATE_KEYS}


def _load_reference_workflows() -> None:
    """Saved workflows for each reference policy, so the studio opens on a working example."""
    import json
    from pathlib import Path

    folder = Path(__file__).parent / "reference"
    for dataset_id, dataset in DATASETS.items():
        path = folder / f"{dataset_id}.json"
        dataset["reference_workflow"] = (
            json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        )


_load_reference_workflows()
