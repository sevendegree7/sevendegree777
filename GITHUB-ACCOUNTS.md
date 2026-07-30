# github accounts on this machine

this windows has several github accounts. for every push, tell cursor which account to use.

## accounts

| account | used for |
|---------|----------|
| sevendegree7 | this project (seven degree pos) |
| alphaarmor-eg | other projects |
| valente | other projects |

## this repo default

- remote: `https://github.com/sevendegree7/sevendegree777.git`
- local git user for commits: `sevendegree7`
- before push, active `gh` account must be **sevendegree7**

## add sevendegree7 once on this pc

```bash
gh auth login
```

choose:

1. github.com
2. https
3. login with browser
4. sign in as **sevendegree7** (not alphaarmor / valente)

check:

```bash
gh auth status
```

## every time before push on this project

```bash
gh auth switch --user sevendegree7
```

then commit + push.

## rule for cursor

when user says "push":

1. ask which github account
2. run `gh auth switch --user <account>`
3. only then push
