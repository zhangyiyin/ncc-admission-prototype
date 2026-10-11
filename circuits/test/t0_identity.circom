pragma circom 2.1.6;

template T0Identity() {
    signal input x;
    signal output y;

    y <== x;
}

component main = T0Identity();
