// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract UpdateComplianceStateVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 21065555536888874342049404404118053900758911030278217210458758195243784386403;
    uint256 constant alphay  = 11005113231505942366824237841673763283799511828226565151708854239982129690152;
    uint256 constant betax1  = 4103962641212606537837473099043558572887712225837421313387412007752712637776;
    uint256 constant betax2  = 3371370349375995569532287452033489796519240571474065920184242407855815136722;
    uint256 constant betay1  = 15574431339467952345780638738251616004680524617268372795272972665285437129770;
    uint256 constant betay2  = 18334781704023393543175961492469708393902153330078772068488906118200686307241;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 19398737942571691021947043852844488612031305047574799576688492875092705609031;
    uint256 constant deltax2 = 1934605128913947393712928973302290446462646471241656383884206476483150523233;
    uint256 constant deltay1 = 16671647407019713981498348784336653260616043534865380849488234984605153645652;
    uint256 constant deltay2 = 3227646349026386469681011695639491185092829313241823946680726893594491372222;


    uint256 constant IC0x = 4807915921430533016747577225490699412773990149649287381584306947204169755045;
    uint256 constant IC0y = 4357925945516355510853220895406340905676963074114950597347779360974454128776;

    uint256 constant IC1x = 20008317568207401903219289529920558308762259103932942914418744071324398057219;
    uint256 constant IC1y = 20344418625962574622592090651055672846704266738050911409959899110959565046833;

    uint256 constant IC2x = 8960026869042503821098876148636083628004402631035006070387536587848227274860;
    uint256 constant IC2y = 15957614261805138493394990378357192825982821808688477975242664838298826700497;

    uint256 constant IC3x = 18034006188330957405681132136152620165450106994232093530152104536598902524214;
    uint256 constant IC3y = 5903685962093159234087584155187635521313370522864313042280586810330237336147;

    uint256 constant IC4x = 8805300113479622382810396572514560248694706659155083094074958812140894746262;
    uint256 constant IC4y = 4788129955127060293140754586090054235481049285165108779794045173131675655094;

    uint256 constant IC5x = 17087445028766121195832968400761146283307446330310959332197278975955306495936;
    uint256 constant IC5y = 20789526884824349714463987576900663916378941709260807076568624916188579095589;

    uint256 constant IC6x = 3807190050468262346470218693891389850820932497481315442991804862736916983500;
    uint256 constant IC6y = 3427282415560927145139461092914055284108219350189304313122805325748857852255;

    uint256 constant IC7x = 8943314621136453421587602845424668482826001137772946473552283894414148721691;
    uint256 constant IC7y = 10080932324635659142873832278409503841821105185855569539260007758038173943625;

    uint256 constant IC8x = 17685477170383750884332768796145614064739982082508332541937412844588035799835;
    uint256 constant IC8y = 13486946874662469494476985776788547976729200199488674972483690776499731168058;

    uint256 constant IC9x = 15146423718657673419267250215957666646437682298439633026730762342171268497980;
    uint256 constant IC9y = 14136028440083819989712181207520766647936535608559419369540894332882455578046;

    uint256 constant IC10x = 1736376617560817020791583694720809806483918010720152230231925482723159388843;
    uint256 constant IC10y = 11349552590920590478127697287007131638393470531869695432971717376657557799341;


    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[10] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x

                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))

                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))

                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))

                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))

                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))

                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))

                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))

                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))


                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F

            checkField(calldataload(add(_pubSignals, 0)))

            checkField(calldataload(add(_pubSignals, 32)))

            checkField(calldataload(add(_pubSignals, 64)))

            checkField(calldataload(add(_pubSignals, 96)))

            checkField(calldataload(add(_pubSignals, 128)))

            checkField(calldataload(add(_pubSignals, 160)))

            checkField(calldataload(add(_pubSignals, 192)))

            checkField(calldataload(add(_pubSignals, 224)))

            checkField(calldataload(add(_pubSignals, 256)))

            checkField(calldataload(add(_pubSignals, 288)))


            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
