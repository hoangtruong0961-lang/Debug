const fs = require('fs');

const jsonContent = {
    "temperature": 1,
    "frequency_penalty": 0,
    "presence_penalty": 0,
    "top_p": 0.9,
    "top_k": 500,
    "top_a": 0,
    "min_p": 0,
    "repetition_penalty": 1,
    "openai_max_context": 2000000,
    "openai_max_tokens": 65535,
    "wrap_in_quotes": false,
    "names_behavior": 0,
    "send_if_empty": "",
    "impersonation_prompt": "[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Write 1 reply only in internet RP style. Don't write as {{char}} or system. Don't describe actions of {{char}}.]",
    "new_chat_prompt": "[Start a new Chat]",
    "new_group_chat_prompt": "[Start a new group chat. Group members: {{group}}]",
    "new_example_chat_prompt": "[Example Chat]"
};

console.log("Written structure");
