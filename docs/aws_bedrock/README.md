# AIESS Bedrock Agent — Architecture & Operations Guide

This directory documents the Amazon Bedrock Agent that powers the AI assistant in the AIESS mobile app. The agent manages Battery Energy Storage System (BESS) installations through natural language.

## Table of Contents

| Document | Description |
|---|---|
| [01_ARCHITECTURE.md](01_ARCHITECTURE.md) | System architecture, components, data flow |
| [02_AWS_RESOURCES.md](02_AWS_RESOURCES.md) | All AWS resource IDs, ARNs, IAM roles |
| [03_ACTION_GROUPS.md](03_ACTION_GROUPS.md) | Action group schemas, tool reference (11 APIs) |
| [04_LAMBDA_FUNCTIONS.md](04_LAMBDA_FUNCTIONS.md) | Lambda handler code, env vars, deployment |
| [05_AGENT_INSTRUCTIONS.md](05_AGENT_INSTRUCTIONS.md) | System prompt, safety rules, response style |
| [06_CONFIRMATION_FLOW.md](06_CONFIRMATION_FLOW.md) | returnControl confirmation protocol |
| [07_MOBILE_APP_INTEGRATION.md](07_MOBILE_APP_INTEGRATION.md) | Client lib, chat UI, session management |
| [08_OPERATIONS.md](08_OPERATIONS.md) | Deployment, updating, troubleshooting, quotas |

## Quick Reference

| Item | Value |
|---|---|
| Region | `eu-central-1` |
| Agent ID | `EUNJYANOZX` |
| Agent Alias (live) | `ITHHACXCBB` |
| Foundation Model | `eu.anthropic.claude-sonnet-4-6` |
| Action Lambda | `aiess-bedrock-action` |
| Chat Proxy Lambda | `aiess-bedrock-chat` |
| API Gateway | `jyjbeg4h9e` — `POST /chat` |
| APIs per Agent quota | 11 (increase to 20 pending) |
