set positional-arguments

default:
  just --list


local-build:
  bun build ./cli/src/main.ts --compile --outfile rp1-local

local *args: local-build
  ./rp1-local {{args}}
