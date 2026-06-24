# Inquiry-Driven Deep Relationship Mining

Deep Relationship Mining will use Inquiry-Driven Exploration rather than reusing the Keyword-Bridged Relationship Generation flow. Concrete relationships may still use keyword evidence, but deep relationships must start from Reader-like Inquiries produced by LLM-mediated Cognitive Exploration Agents, then use LLM-Led Retrieval, path building, and critique to form directional Deep Relationship Paths across multiple Passages.

This decision rejects treating abstract relationships as a richer label on top of same-topic or shared-keyword candidate edges. That approach makes deep mining too similar to tag expansion and misses paths where a Passage becomes meaningful only through an intermediate Passage. The first deep-mining loop will use four Cognitive Exploration Agents: Inquirer Agent, Retriever Agent, Path-Builder Agent, and Critic Agent.
